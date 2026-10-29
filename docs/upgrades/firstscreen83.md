# firstscreen83: 79 KB of room on the first screen (round 83)

The first-screen code budget (`dev/boot-test.js`: what the window parses before its first frame, without whole-line
comments) was at 1,881 of 1,884 KB. Every new feature fought over the last kilobyte, and the budget had just been raised
to unblock main. This stream measured which first-screen code runs before the first input, moved the three biggest
blocks that never do into lazy groups, and lowered the budget.

**Result: 1,881 → 1,802 KB of code (−79 KB), budget 1,884 → 1,810 KB** (8 KB headroom). Still 71 scripts, 28 sheets.

## How it was measured
- **`node dev/smoke.js --coverage-ready <file>`** (new): CDP precise coverage (`Profiler.takePreciseCoverage`, call
  counts) taken the moment the first screen is up (`hearth:ready`, `--coverage-ready-ms` to wait longer), before any
  input. The counters restart there, so a `--coverage <file>` taken at the end of the same run holds only what ran
  after it (every feature group loading, idle, still no input).
- **`node dev/firstscreen-coverage.js <ready.json> <after.json> --blocks 40`** (new): per first-screen file, the KB of
  functions that had not run at the first screen, and how much of that still had not run seconds later; then the
  biggest such blocks. Several runs can be given comma-separated (a function that ran in any counts as run).
- Runs: the heavy owner-like profile (`/tmp/hearth-bigprofile70`, Projects as the first screen) and an empty profile
  (a chat first). 9 s each, no input.

## What was found
Of the 2,187 KB of first-screen source (with comments), **1,414 KB had not run when the first screen was up, and
1,375 KB of it still had not run 9 s later** with every feature group in. Most of it is event handlers and menus, which
is normal, but a few blocks are whole dialogs that only a click opens:

| Block (file:line) | KB | |
|---|---:|---|
| appui.js:78 `openSettings` (the Settings dialog) | 26.4 | moved |
| access-rules.js:183 `commandFindings` | 11.5 | kept (the permission classifier, see below) |
| director-dock.js:44 `attach` | 10.4 | kept (see below) |
| native.js:688 `messageEl` | 9.0 | kept (draws every message; a chat first screen runs it) |
| notes.js:730 `manage` / :508 `update` | 8.4 / 7.4 | kept (small, many callers) |
| sync.js:321 `conflicts` (+ `diffOf`, `trash`) | 7.8 (+3.9, 2.7) | moved |
| memory.js:216 `open` | 7.8 | kept |
| look.js:171 `picker` | 7.4 | kept |
| native.js:538 `onListClick`, :2034 `onEvent`, :1975 `send` | 6.6, 6.0, 5.1 | kept (first click / first reply) |
| meter.js:650 / 559 / 713 / 304 (the Usage dashboard's panes, the dashboard, charts) | 4.6, 4.3, 3.6… | moved (≈ 25 KB in all) |
| native.js:2468 `chatMenuItems`, :813 `messageMenu` | 4.8, 4.7 | kept (see native.js below) |
| appui.js:730 / 827 / 690 (Recently deleted, Backups, Downloads) | 3.8, 3.7, 3.4 | moved |

## Upgrades
### The first screen
1. **Settings and AppUI's other dialogs load after the first screen** (appui-dialogs.js, lazy group `appdialogs`):
   Settings, Downloads, Recently deleted chats, Backups and the restore, the old usage list. −40 KB. `AppUI.openSettings()`,
   `AppUI.trashDialog()`… keep their names and wait for the group when it isn't in yet; the group comes in an idle
   moment after the first screen, so it is normally there before anyone clicks. The Ctrl/⌘+, key, the ⚙ button, the
   palette lines and /settings work from the first moment, as before.
2. **The Usage dashboard loads after the first screen** (meter-dash.js, group `meterdash`): its tabs and panes, the
   canvas charts and the Codex account card. −25 KB. The rail pill / strip, the per-message token lines, budgets,
   alerts and every /usage command stay in meter.js; `Meter.dashboard()` and Ctrl+Shift+U (open / close) work from
   the first moment.
3. **Sync's conflicts list and Deleted files load after the first screen** (sync-conflicts.js, group `syncconflicts`).
   −15 KB. The status dot, its menu, `Sync.whatIs()` and the big-delete guard (`held()`, used synchronously by
   /sync review) stay in sync.js.
4. **The first-screen budget is lowered to 1,810 KB** (1,802 + 8 KB headroom): the next first-screen addition has
   room without a raise, and a raise past it needs a cut first.

### Kept exactly as before
5. The moved code is the same text, moved whole. What it shares with its first-screen file comes through one small
   object each (`AppUI._dialogs`, `Meter._dash`, `Sync._conflicts`): the looks and spell-check languages, the
   downloads of this session (with a setter for the dialog's repaint and Clear), the meter's numbers and helpers
   (`Meter.stats` / `Meter.prefs` read live, as `prefs` can be replaced by /meter reset), sync's api and names. Every
   public function keeps its name and returns what it returned (all were already async).
6. No CSS moved (the dialogs' rules stay in their sheets), so nothing is unstyled for a frame.

### For the next streams (dev, not counted)
- `node dev/smoke.js --data <profile> --coverage-ready /tmp/r.json --coverage /tmp/a.json --wait 9000`, then
  `node dev/firstscreen-coverage.js /tmp/r.json /tmp/a.json --blocks 40`: what the first screen parses but doesn't run.
- The pattern for a big dialog inside a first-screen module: move it whole to `<file>-<part>.js`, give the module a
  `_part` object of what it reads, keep a same-named async stand-in that does `await Lazy.load('<group>')`, add the
  group (default tier: an idle moment after the first screen) and its name to a nearby `lazy-at.js#…` tag, then
  `node dev/lazy-manifest.js`. Only for functions whose callers already await them.
- `dev/checks/firstscreen83.js`: every moved dialog opens through its old name with its group already loaded, and
  again after a reload with every group held back (the first open loads it).

## Not changed (reported)
- **native.js stays whole.** The seam exists: its two right-click menus (`messageMenu`, `chatMenuItems`, ≈ 9 KB) only
  call closure functions (about 30 of them) and assign nothing shared, so they could move behind a `Native._menus`
  object. But both are called synchronously (a click or right-click builds its menu at once, declutter.js calls
  `Native.messageMenu` on a message's right-click; `chatMenu` and the ⋯ return `chatMenuItems`' list as is), so before their group is in they would need to become async and the
  menu would open a moment later. Not worth ≈ 9 KB. The rest (message drawing, send, the engine events, the list's
  clicks) runs at the first chat or the first reply.
- **access.js / access-rules.js (≈ 86 KB) stay.** `native.js` reads `Access.sendOptions(chat)` on every send through
  `typeof Access !== 'undefined'`, and permission requests arrive from the MCP server at any time: a lazy Access would
  quietly send without its options in the moment before it loads. Security first.
- **director-dock.js (17 KB) stays.** tools.js attaches it when a tool's dock shows (`typeof DirectorDock` guards it,
  so before it loads the dock would come up without its strip), and director-cmds.js / assist.js / keys-ui.js call it
  directly. Movable with the Lab group's `after` and a re-attach in tools.js, for a later round if the room is needed.
- **astra.js (131 KB, Codex) and jam.js (48 KB, the creative session) were not touched.** Nothing of theirs moved.

## Numbers
| What | Before (7b2a9f0) | After |
|---|---:|---:|
| First-screen code (boot-test) | 71 scripts · 1,881 KB · 28 sheets · 423 KB CSS | 71 · **1,802 KB** · 28 · 423 KB |
| appui.js · meter.js · sync.js (code) | 78.8 · 80.4 · 47.4 KB | 38.7 · 55.4 · 32.8 KB |
| lazy-data.js (3 group lines) | 106.6 KB | 106.9 KB |
| Budget | 1,884 KB | **1,810 KB** |

Startup, `node dev/perfguard.js --ab 7b2a9f0 --only startup --lock --rounds 5` (heavy profile, base and new launched in
turn, 15 cold starts each, 4 shared CPUs, load ≤ 4.8): **✓ no regression**.

| Metric | Base | New | Change | p |
|---|---:|---:|---:|---:|
| Start → first usable chat | 1,052 ms | 1,088 ms | +36 ms (+3 %) | 0.3 (noise; allowed +105) |
| Start → settled (last long task) | 1,771 ms | 1,782 ms | +11 ms (+1 %) | 0.15 |
| CPU to the first screen (main + window) | 5,430 ms | 5,490 ms | +60 ms (+1 %) | 0.22 |
| CPU to settled | 5,540 ms | 5,590 ms | +50 ms (+1 %) | 0.25 |

An earlier 3-round run said "inconclusive" (+7 %, settled too close to call). In that run the new side's first block
was slow before any page code had run (the main process's app ready at 272 ms against about 220 ms, on unchanged
code), so it was load. With 5 rounds both sides are the same within noise. **On this box the cut is not measurable in
milliseconds.** V8 only pre-parses the bodies of functions that are never called, so 79 KB less to read and pre-parse
is a few ms, below the noise of software GL and four shared CPUs. The gain is room: the next features fit without a
budget raise. The three groups load in idle moments after the first screen, and "settled" didn't move.

## Tested
- `node --check` on every touched JS file. `node dev/lazy-manifest.js` (rewritten; ✓ names 956, aliases 340, actions
  1408, keys 516, apps 51, tools 9, dups 0). `node dev/boot-test.js` (2,998 checks, new budget).
  `node dev/lazy-groups-test.js` ✓.
- Unit scans and Node tests: datasafe-scan, winmac-test (+ `dev/winmac-scan.js` 0 hits), errorcalm-scan,
  storeack-scan, chatsafe-scan, commandonly-scan, boot-test, sync-test, appsearch-test: all pass.
- App checks (under `flock /tmp/hearth-run.lock`, 5 per hold): **firstscreen83** (new, 42 steps: every moved dialog
  through its old name with its group loaded and after a reload with every group held), lazy, chatperf, chatwindow72,
  projects, labtools73, sync72, qa-commands, appsearch, settingscalm, usagelimits, backupauto, sync, options: all pass.
- `appcalm` fails on 'Ctrl/⌘+K finds "playground"' (the palette ranking). It **fails the same way on the base**
  (7b2a9f0, run with `dev/smoke.js --app`), so this stream didn't cause it.
- perfguard A/B as above.

## Files
- New: `appui-dialogs.js`, `meter-dash.js`, `sync-conflicts.js`, `dev/firstscreen-coverage.js`,
  `dev/checks/firstscreen83.js`.
- Changed: `appui.js`, `meter.js`, `sync.js` (the moved blocks out, same-named stand-ins and the `_part` objects in),
  `lazy-data.js` (3 groups, manifest regenerated), `index.html` (2 lazy-at tags name the new groups),
  `dev/smoke.js` (`--coverage-ready`), `dev/boot-test.js` (budget 1,810 KB), `docs/lazy-groups.md`,
  `docs/upgrades/firstscreen.md` (history line).

## For the patch notes
- Hearth's first screen is lighter: about 80 KB less code is read before the window shows. Settings, the Usage
  window and Sync's conflicts and deleted files now load quietly a moment after Hearth opens, instead of before it.
- Nothing looks or works differently: every button, key and command opens them from the first moment, as before.
- This makes room for the next features to start fast too.
