# winperf78 — Windows slow paths (round 78)

The owner runs Hearth on a Windows PC (RTX 4080, OneDrive / iCloud, Defender) and a Mac. On Windows every new process
costs ≈ 30–150 ms (PowerShell ≈ 300–800 ms: the .NET runtime and its scan), and every file open is scanned by Defender,
so things that are free on Linux add up there. All testing here is Linux, so this round (1) taught the main-process
lag probe to count processes and fs calls and to *cost* them like Windows, (2) audited every Windows-only path, and
(3) cut the biggest ones, keeping the Mac / Linux behaviour.

## How it is measured
- `mainlag-probe.js` (tests only, `HEARTH_LOOPLAG`): besides the event-loop delay, CPU profile, sync fs and IPC it now
  counts **every process started** (spawn / execFile / exec / fork and the Sync ones, by program and call site, with the
  time the start held the thread), **every async fs call** (fs.promises + callbacks) and **fs.watch** calls.
- **Windows simulation knob** `HEARTH_WINSIM=1` (each part settable alone): `HEARTH_SLOWFS_US` 150 (each sync fs call),
  `HEARTH_SPAWN_MS` 40 (each process start holds the main thread: `uv_spawn` → `CreateProcess` is synchronous on Windows),
  `HEARTH_SPAWN_LAT_MS` 120 (the child answers later), `HEARTH_PS_LAT_MS` 500 (PowerShell, on top), `HEARTH_SLOWFS_ASYNC_MS`
  1 (async opens / reads / writes / stats answer later). Node's own Linux-only recursive-watch tree walk is reported
  apart and not charged (Windows and the Mac watch natively). The simulated time spent is reported per take (`sim.spentMs`).
- **Check `winperf78`** (opt-in, `WINPERF78=1 node dev/run-checks.js --exact winperf78`, ≈ 2 min, under the run lock): the
  heavy profile with 40 projects (`/tmp/hearth-bigprofile72`), the simulation on, per action: startup (incl. the update
  check 25 s in), open a long chat, send a message (fake engine), open a project, open the Lab, the Sound desk, ▶ Play a
  Lab scene and leave, sync's first pass, a sync pass after a change. Budgets per action: processes, PowerShell starts,
  the app's own sync fs calls, async fs calls, the worst main-thread stall.
- **Unit test `winperf78-test`** (in UNIT): the long-lived PowerShell (fake), drive types / graphics preference / updater
  start checks kept between starts, the async media search, the probe's process counter.

## Before → after (Linux + Windows simulation, same check, same probe, base 8f7bd05 vs this branch)

| action | processes | app sync fs calls | async fs calls | worst main stall |
|---|---|---|---|---|
| startup (fresh profile) | 10 → 8 | 818 → 633 | 4,409 → 4,601 (moved off the thread) | 223 → 209 ms |
| open a long chat | 0 → 0 | 1 → 1 | 0 → 0 | 0 → 0 |
| send a message | 1 → 1 (the engine) | **274 → 63** | 8 → 219 (moved off the thread) | 54 → 50 ms |
| open a project | 0 → 0 | 41 → 41 | 2 → 2 | 0 → 0 |
| open the Lab | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Sound desk | 1 → 1 (its host) | 46 → 44 | 0 → 0 | 61 → 53 ms |
| ▶ Play and leave | 0 → 0 | 70 → 70 | 12 → 12 | 76 → 71 ms |
| sync first pass | 0 → 0 | 47 → 47 | 48.8k → 48.7k | 227 → 237 ms |
| sync pass after a change | 0 → 0 | 8 → 8 | 18.3k → 18.3k | 0 → 38 ms |

(The sync stalls are the probe's own stack-walking under 15,000 Linux watch calls; ±40 ms is noise on the shared box.)

## Windows-only processes (static audit; these never run on Linux, so the table above can't show them)

Per **start** on the owner's PC (warm: engine versions already known), before → after:

| what | when | before | after |
|---|---|---|---|
| Astra's doctor: `claude --version`, `codex --version`, `codex login status` | start (Astra's panel) | 3 | 1 (versions from the per-binary cache; one sign-in answer) |
| engine check: `claude auth status`, `codex login status` | 10 s, then every 30 min | 2 | 2 |
| Codex app-server (model catalog, kept for Astra) | 10 s | 1 | 1 |
| update guard settle / bring back (`git rev-parse` / `diff --quiet` ×2 files, `stash list`) | 4 s | 4–5 git | **0** (HEAD read from .git, files' size + date, stash log unchanged) |
| update check preflight (`rev-parse` ×4) | 25 s, then every 30 min | 4 git | **1** |
| graphics preference (`reg query`) | 15 s | 1 reg | **0** (asked weekly) |
| drive types for the Recycle Bin (PowerShell) | 60 s | 1 PowerShell | **0** (kept a week, each drive's serial checked) |
| **total** | | **16–17 (1 PowerShell)** | **5 (0 PowerShell)** |

Per **action** on Windows:
- **a sync pass after anything changed**: 1 PowerShell (cloud-files probe, ≈ 0.3–0.8 s) → **0** while the long-lived one
  runs (one start, then it answers in milliseconds; it quits after 2 idle minutes). A file still downloading asked one
  more PowerShell each → 0. Free up space polled one PowerShell every 0.5 s per file → 0.
- **every settings save** (≈ 80 places save settings): both system-wide keys unregistered and registered again, the
  "start at login" registry entry read, the spell checker set → **nothing** unless one of those settings changed.
- **every reply**: the chat-media search walked the chat folders with ≈ 210 sync calls (more as the workspace grows; each
  a scanned open on Windows) on the main thread → **0 on the main thread** (same order, async).
- **start**: crash-safety sweep 107 `readdirSync` → async; ticket files 80 `existsSync` → async; the tray icon drawn pixel
  by pixel (≈ 20–30 ms) → read from the .ico; the window icon decoded 4–5× → once.

## What shipped
1. One long-lived hidden PowerShell answers every cloud-file question of a session (sync passes, downloads, Free up
   space, Prepare for offline); a server that doesn't answer falls back to the one-shot call as before (`cloud-files.js`).
2. Drive types for the Recycle Bin check kept a week in `data/win-drives.json` (this PC only, never synced), trusted only
   while each drive's serial number matches (`winpolish.js` warmDrives, main.js).
3. The Windows graphics preference is checked once a week (or when Hearth's program / the graphics choice changes),
   not at every start (`gpu52main.js`).
4. The update guard's start-up settle / bring-back skips git entirely when HEAD, the tracked config.json / theme.css and
   the stash log are as they were when everything was settled (`updatermain.js`).
5. The update check's preflight asks its four git questions in one process (any unusual answer: one by one, as before).
6. Astra's doctor reads engine versions from the per-binary cache and reuses a sign-in answer from the last 5 minutes;
   two version questions for the same binary at once share one process (`engines.js`, `installs.js`).
7. Settings saves no longer re-register the global keys, re-read the login item or reset the spell checker unless one of
   those settings changed (a key that failed to register is still retried) (`appshell.js`).
8. The per-reply media search is asynchronous (`chatmediamain.js`).
9. The crash-safety leftovers sweep lists folders asynchronously (`crashsafemain.js`).
10. Ticket files are checked asynchronously, and the ✦ tracker's ticket line looks only at today's shows (`ticketsmain.js`).
11. The window / tray icons: the .ico read once per start, the tray's sizes taken from it (`appshell.js`).
12. The lag probe counts processes, async fs calls and watches, with the Windows simulation knob (`mainlag-probe.js`).
13. Check `winperf78` (opt-in) with per-action budgets; `winperf78-test` in the unit set.

## Found, not changed (next candidates)
- **Each sync pass stats every file on both sides** (≈ 8,800 + 8,800 on the test profile, 18k async calls a pass, one
  pass per change). Off the main thread, but on Windows + OneDrive each stat goes through the cloud filter driver and the
  pass holds libuv's 4 threads for ≈ 1–2 s, delaying other file work. A pass limited to the folders the watcher reported
  (full scan every few minutes as a safety net) would cut it ~100×; it touches the sync engine's core and is left for a
  sync stream with the two-computer simulator.
- Engine discovery on Windows checks ≈ 250 candidate paths (PATH × .exe/.cmd/.bat, npm, Volta, scoop…) with `statSync` per
  engine check (start + every 30 min): ≈ 10 ms on the main thread.
- The first ▶ Play of a session creates its Electron session (≈ 300 ms on the main thread, `session.fromPartition`), and
  each new scene build copies three.js (1.3 MB, synchronous write; Defender scans it once).
- Astra's doctor and the engine check both ask `codex login status` at the start (the doctor runs first); the check is
  kept fresh on purpose (a sign-out must be noticed).
- The first start on a profile without the tool-use log reads every chat of the last 35 days (tokenaudit seed, async).
- `powerwisemain.js` compiles C# through PowerShell (`Add-Type`) to read the battery saver: laptops on battery only.
- Module loading at start (≈ 100 `realpathSync` / `readFileSync` from `require`): each is a scanned open on Windows;
  nothing to change without a bundler (no build step by rule).

## For Codex
- `cloud-files.js` (yours originally): `attributes()` now goes through one long-lived PowerShell (`SERVER_SCRIPT`, a
  ReadLine loop answering `@@H <json>` lines) when no `execFile` is passed; passing `execFile` (your tests, synchard74)
  keeps the one-shot call exactly as before. New export `server` (state / stop / reset, tests). Marked `(round 78, winperf78)`.
- `engines.js` `doctor()`: versions via `Installs.version` (cached per binary path + size + date) and `codex login status`
  reused for 5 minutes (`signCache`, filled by `checkEngine` too). Astra's `doctorCache` in `astra.js` is unchanged.

## Risks
- The PowerShell loop could not be run here (no PowerShell on this box). If Windows PowerShell 5.1 doesn't answer it
  (an execution policy, constrained language mode), the first question waits ≤ 6 s and is then asked the one-shot way;
  after two failures the session uses the one-shot way only. Worst case: two sync passes ≈ 6 s slower once per session.
- Drive types kept a week: a drive whose letter and serial stay the same but whose type changed (practically never) is
  judged by the kept type for up to a week; a different stick in the same letter is asked again (serial differs).
- The graphics preference is re-checked weekly: if the Windows entry is deleted, Hearth writes its choice back within a
  week instead of at the next start.
- Settings saves no longer re-apply the global keys: a key another app released later is only retried after a failure
  (as now) or a change.

## For the patch notes
- Hearth starts fewer helper programs on Windows: about 5 at each start instead of 16, and no PowerShell at all on most
  starts.
- Syncing with OneDrive or iCloud on the PC is lighter: Hearth keeps one small background helper to ask the cloud drive
  about files, instead of starting PowerShell for every sync.
- Replies no longer make Hearth pause to look for pictures and videos the AI made; that search now runs in the background.
- Saving a setting no longer resets your keyboard shortcuts and startup option behind the scenes each time.
- Hearth remembers your drives and graphics preference for a week, so it doesn't ask Windows again at every start.
- Nothing changes on the Mac, except the same smaller costs when replies arrive and settings are saved.
