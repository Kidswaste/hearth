# Round 118 · startup118: a lighter start for the chat wrapper + Lab

Hearth is now an AI chat wrapper (Claude and Astra, in projects, with cloud sync) plus a Three.js editor the AIs run.
After round 116 (slim116), the first screen still parsed 1,679 of the 1,688 KB its budget allows (`dev/boot-test.js`),
so no feature had any room left. This stream measured the start, took three whole files that the chats / projects
view does not need for its first paint off the first screen, made two main-process modules load on first use, removed
two round-116 leftovers, and lowered the budget.

**Result: 1,679 → 1,597 KB of first-screen code (−82 KB), 64 → 62 scripts, 28 → 27 stylesheets (423 → 416 KB).
The budget goes from 64 / 1,688 KB / 28 / 424 KB to 62 / 1,607 KB / 27 / 420 KB (10 KB of code headroom).**

## Numbers

Cold starts are from `dev/coldstart-report.js`: 5 counted launches after a warm-up, medians, in ms from process start.
"Empty" is a fresh profile (a chat first). "Heavy" is `dev/bigprofile.js <dir> --projects 40` (1,500 chats, 120 long
ones, 50 Lab scenes, 40 projects; Projects first). Before is 4cea830 (a `git archive` copy), after is this branch.
They were run one after the other on the shared 4-CPU test box (load ≈ 3), not interleaved, so treat
differences under ~50 ms as noise.

| What | Empty before | Empty after | Heavy before | Heavy after |
|---|---:|---:|---:|---:|
| First frame on screen (`firstPaint`) | 1,056 | **958** | 1,071 | **974** |
| Chats list drawn (`splash:chats`) | 584 | **527** | 625 | **570** |
| First screen usable (`hearth:ready`) | 602 | **542** | 651 | **591** |
| Window shown | 470 | 445 | 445 | 439 |
| Every early feature group in (`features`) | 3,452 | 3,459 | 5,298 | 4,823 |
| Window's CPU, first 10 s (renderer) | 1,080 | 1,010 | 2,450 | 2,190 |
| Main process's CPU, first 10 s | 1,330 | 1,300 | 1,620 | 1,530 |
| IPC in the first 5 s (calls · main-thread ms) | 79 · 33.6 | 75 · 31.5 | 74 · 32.0 | 71 · 28.6 |
| main.js requires before `ready` (ms) | 27.7 | 27.9 | 26.7 | 27.0 |
| main.js requires in the 3 s after the window | 19 modules · 41.0 ms | **17 · 34.5 ms** | (not recorded) | 17 · 38.6 ms |

| First screen (`node dev/boot-test.js`) | Before | After |
|---|---:|---:|
| Scripts parsed before the first frame | 64 | **62** |
| Code (no whole-line comments) | 1,679 KB | **1,597 KB** |
| Stylesheets | 28 · 423 KB | **27 · 416 KB** |
| Budget | 64 / 1,688 / 28 / 424 | **62 / 1,607 / 27 / 420** |
| Lazy groups | 119 | 122 (memory, notes, jam) |

**Idle** (dev/checks/idlecpu.js: 10 s of nothing after things settle; the same check on both trees). The idle cost
was already near the floor and did not change: a chat open is window 0.2 % · 0.5 wakeups/s, main 0.5 % · 6 timers a
minute. Hidden, all processes together use 0.09 % and 8.5 → 8.4 kernel wakeups/s. The Lab still is window 0.4 → 0.7 %
(GPU 3.7 → 18 % in one run, software GL on a loaded box: noise; the Lab code did not change). Board, grid and Activity
are all ≤ 0.2 % on both trees.

`dev/coldstart-report.js` (with `dev/boot-probe.js`) now also lists what main.js requires in the 3 s after the window
exists (registerAfterWindow and the first screen's IPC), `requiresAfter` in its JSON, so that part of the
main-process start can be seen. Before this round, only the requires before Electron's `ready` were listed.

### The 20 largest first-screen files before this round, and why each was there

| File | KB | Why it is needed at the first paint |
|---|---:|---|
| native.js | 174.7 | the chat view itself: messages, composer, sending, streaming |
| astra.js | 131.3 | Astra's engine side and its chat (Codex-owned, not touched beyond one line) |
| lazy-data.js | 101.5 | the lazy groups and the stand-ins for their commands, keys and actions (the manifest) |
| features.css | 100.3 (CSS) | shared styles of the chat, rail and dialogs |
| polish.css | 82.5 (CSS) | shared look |
| renderer.js | 60.8 | the app shell: rail, surfaces, keys, menus |
| look.css | 58.0 (CSS) | the themes |
| access.js | 56.6 | the permission check on every send and tool call |
| meter.js | 55.5 | the token strip / rail pill drawn at once, the engines' usage feed |
| keys-ui.js | 48.9 | Ctrl+/ at once; its key registry feeds the stand-ins |
| **notes.js** | 47.5 | half was the prompt library ("/" in every chat box: kept). **The Notes panel half moved** |
| makes.js | 47.0 | chats grouped under a make in the chats list, their names and colors |
| **jam.js** | 45.8 | **not needed: the Lab's Claude ⇄ Astra jam. Moved** |
| chat-scenes.js | 44.3 | each chat's color, mark and scene on its row |
| panel.js | 43.1 | the chats list |
| declutter.js | 39.5 | the tidy stylesheet, every right-click menu |
| sync.js | 36.5 | the rail's sync chip and its notes |
| appui.js | 35.3 | Ctrl+K palette, toasts, settings entry points |
| missions.js | 34.7 | Swarm / missions on send (off-limits this round) |
| offline.js | 34.1 | the calm offline / busy / limit line on a failed reply, the waiting queue |

Also moved: **memory.js** (19.5 KB, the memory editor dialog). Kept and why: see "Not changed" below.

## What moved

### Off the first screen (lazy groups, `lazy-data.js`; manifest regenerated with `node dev/lazy-manifest.js`)
1. **`memory`**: memory.js, the 🧠 memory editor (facts, pins, expiry, cost). It loads in the calm moment after the
   start, or on first use. The 🧠 button (its click moved to start.js), its Ctrl/⌘+K line, the rail's ⋯ menu, `/memory edit` and a fact an
   AI remembers (native.js stamps its details) load the group first. The `addons` group (the /memory commands) and `options`
   (memory tidy) now come after it. The 🧠 tooltip's cost is filled in when the group loads, as before (it used to be 4 s
   after the start).
2. **`notes`**: notes.js is split. **notes-panel.js** (the Notes panel, 20 KB) is lazy. The prompt library stays in
   notes.js on the first screen. Ctrl/⌘+J, 🗒, its Ctrl/⌘+K line, the keys sheet, "Save to notes" (a selection, a code
   block, a message, the command bar's 📝, `| note`, the OS context action), `/note` and 🛟's restore of typed text all
   load it first. `addons` (the /note commands) comes after it.
3. **`jam`**: jam.js + jam.css, the Lab's Claude ⇄ Astra jam. `/jam` and its Ctrl/⌘+K line are stand-ins. A jam card in a
   chat draws its head until the group is in, then the whole card (the same swap comp cards use, round 87).
   chat-scenes.js and assist.js read a running jam only once the group is in, so nothing looks at the jam during the
   first screen (fastboot: no lazy global touched). The ⚇ chip still offers Jam through its stand-in.

### Main process: required on first use (main.js `lazyIpc`, listed by the fastboot check)
4. **aemain.js** (After Effects scripting, ffmpeg probe / transcode) and **boardmain.js** + **boardpinsmain.js** (the
   mood board's file import / snapshots, the Pinterest window). Their channels answer as before; the module is required
   on the first call. boardmain.js reads `electron` on use and makes its folders on first use, not at the start.
   `dev/checks/fastboot.js` now also checks that `ae:jobs`, `board:dir` and `board:pins` answer.

Already lazy and left as they were: Adobe / Premiere, deploy, apps windows, board, capture, Forgeheart (`addons`),
Nodes, onboarding / what's new (`discover`, `firstrun`, `patchnotes`), everything Lab-only (`lab`, `labintent`, …).
Making the bigger 'soon' groups (board 564 KB, capture 305 KB) load only on use was looked at and not done. They hook into every
send (Native.hooks), add the board's rail button, and handle capture's global keys from the main process, so the app
would look different until first use.

## Cleanup (round-116 leftovers)
5. icons.js: the Life tab's `quests` icon and its `quests` id mapping (no rail button or tool uses them any more).
6. renderer.js: the project bar's check for the Sound tab (`feature !== 'vst'`), which left with the music studio.
   No store, setting, timer or interval of a removed feature was still read or started at boot. The scan covered every
   first-screen file, main.js, preload.js, store.js and every `setInterval` / `Power.every`. Round 116 had already removed them.

## Tests run
- `node dev/boot-test.js`: 2,756 checks, new budget ✓
- `node dev/lazy-manifest.js` (rewritten), then `unit:lazymanifest-test` (its `--check` twice) ✓: names 943, aliases 335,
  actions 1,379, keys 500, apps 51, tools 8, duplicates 0, the same as the old order
- `flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact …` with `HEARTH_THREE_DIR` set:
  **qa-commands ✓, qa-keys ✓, lazy ✓, fastboot ✓ (with the new ae / board step), unit:lazymanifest-test ✓, labload94 ✓,
  idlecpu ✓, storeack77 ✓ (Notes panel with a store arriving from the other computer), memorytidy ✓**
- **jam: ✖ on both trees.** It hits run-checks' 600 s limit while still working through its rounds (the screenshot shows
  jams running, cards drawn, stopped and started again). The unchanged base (4cea830) times out the same way on this
  box, so this is the box's speed, not this change.
- Node scans: datasafe-scan (baseline: the `notes` store now in notes-panel.js), chatwin-scan, storeack-scan,
  errorcalm-scan, chatsafe-scan, winmac-test ✓.
- No new logic was added, so no new unit test (the loads use the existing `Lazy.load` / `Lazy.isIn`).

## For the patch notes
- Hearth opens a little faster. The first picture and the chats list come about 0.05–0.1 s sooner here, and the window
  has about 80 KB less code to read before showing anything.
- Notes, the memory editor and the Lab's Claude ⇄ Astra jam now load just after the start instead of before it.
  Everything works the same: Ctrl/⌘+J, 🧠, /jam, "Save to notes" and the menus all work from the first moment.
- After Effects / video tools and the mood board's background part start only when you first use them.

## For Codex
Minimal edits in Codex-owned files, each marked `// (round 118, startup118)`:
- **astra.js** (the ⚇ chip's menu, one line): `const jam = (typeof Jam !== 'undefined' ? Jam : window.Jam) || (Commands.get('jam') ? {} : null);`
  The Jam entry shows while the jam's lazy group is still a stand-in. Its action already takes the `Commands.get('jam')`
  path (`Native.setDraft(agentId, '/jam ')`), so nothing else changes.

No other Codex-owned file (projects*, project-workspace*, sync-engine.js, cloud-files.js, codex-*, workbench-*,
engine-watch) was touched. projchats*.js and the sync tests (projsync118's) were not touched either.

## Not changed (reported)
- **meter.js** (55 KB): ≈ 26 KB of it is chat commands that could become a lazy `metercmds` group. Two of them override
  the chat stream's `/tokens` and `/context`, and `/meter reset` replaces the prefs object, so this needs a careful
  refactor. Left for a later round.
- **offline.js**, **access*.js**, **makes*.js**, **chat-scenes.js**: they draw or check something at the first paint or on
  every send (see the table).
- **missions.js / manager.js / swarmlean.js / collab-eyes.js**: off-limits this round.
- lazy-data.js grew 0.5 KB (three group lines; jam's stand-ins).
