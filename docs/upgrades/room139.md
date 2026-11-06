# Round 139 · room139: room on the first screen (−49 KB, nothing visible changes)

The first screen was at 1,585 of the 1,586 KB `dev/boot-test.js` allows, so every new feature had to fight for the last
kilobyte (round 138 left out a Ctrl/⌘+K line for lack of room). This stream measured what the first screen reads before
its first frame, moved five pieces that nothing on it needs at the first paint into lazy groups (the way rounds 118 and
119 did), kept every command, Ctrl/⌘+K line, key and menu row working from the first moment, and lowered the budget.

**Result: 1,586 → 1,537 KB of first-screen code (−49 KB). The budget goes from 62 / 1,586 KB / 27 / 420 KB to
62 / 1,547 KB / 27 / 420 KB (10 KB of code headroom).**

## Before / after

| First screen (`node dev/boot-test.js`) | Before (222bd29b) | After |
|---|---:|---:|
| Code before the first frame (no whole-line comments) | 1,586 KB | **1,537 KB** (−49 KB) |
| Scripts parsed before the first frame | 62 | 62 |
| Stylesheets | 27 · 415 KB | 27 · 415 KB |
| Budget | 62 / 1,586 / 27 / 420 | **62 / 1,547 / 27 / 420** |
| Lazy groups | 151 | 156 (keyslines, scenecmds, accessui, offlineprep, makesview) |
| First frame (`firstPaint`, cold start, median ms) | 840 | 829 |
| First picture / ready-to-show (median ms) | 472 | 450 |
| First screen usable (`hearth:ready`, median ms) | 490 | 470 |
| Every early feature group in (`features`, median ms) | 3,109 | 3,370 |

Cold starts: `node dev/coldstart-report.js --runs 5` (after one warm-up launch, fresh profile), the old tree a copy
of 222bd29b, run one after the other on the shared test box. The first screen is about 20 ms earlier; differences under
~50 ms are noise here. `features` is later because five more groups now load after the start (about 68 KB, in idle
moments); nothing on the first screen waits for them.

| File | Before (KB of code) | After |
|---|---:|---:|
| keys-ui.js | 49.1 | **25.2** |
| access.js | 56.8 | **45.7** |
| chat-scenes.js | 44.4 | **35.6** |
| makes.js | 43.0 | **31.7** |
| offline.js | 34.1 | **30.2** |
| lazy-data.js (the new groups' stand-ins: 199 keys-sheet lines, /scene, /scene-timeline, /makes) | 115.4 | 125.3 (+9.9) |
| lazy.js | 25.7 | 25.8 |

The manifest's totals are unchanged: names 955, aliases 337, actions 1,406, keys 502, apps 51, tools 8, duplicates 0.

### The largest first-screen scripts, and what at the first paint needs them

| File | KB | Needed at the first paint for |
|---|---:|---|
| native.js | 175.3 | the chat view itself (messages, composer, sending, streaming) |
| astra.js | 131.8 | Astra's engine side and its chat (Codex-owned: not touched) |
| lazy-data.js | 115.4 | the lazy groups and every stand-in (commands, Ctrl/⌘+K lines, keys, menu rows) |
| renderer.js | 61.0 | the app shell: rail, surfaces, keys, menus |
| access.js | 56.8 | the permission check on every send and tool call, its asks and cards. **Its dialogs (panel, activity log, AI setup's files box, ≈ 11 KB) moved** |
| keys-ui.js | 49.1 | Hold Alt / Ctrl, the ⌨ button, Ctrl/⌘+/. **The sheet's lines (≈ 24 KB, mostly the Lab, its timeline, Nodes and right-click menus) moved** |
| chat-scenes.js | 44.4 | each chat's color, mark and scene on its row, the Lab link. **/scene and /scene-timeline (≈ 9 KB, they load the Lab first anyway) moved** |
| makes.js | 43.0 | the store, a make's rooms and cards, the send / render hooks. **The Makes page on the Commands page and /makes (≈ 11 KB) moved** |
| panel.js | 42.5 | the chats list |
| declutter.js | 39.7 | the tidy stylesheet (REVEAL), every right-click menu |
| sync.js | 36.5 | the rail's sync chip and its notes |
| appui.js | 35.5 | Ctrl/⌘+K palette, toasts, the themes |
| missions.js | 34.7 | Swarm / missions on send (off-limits) |
| offline.js | 34.1 | the offline / busy line on a failed reply, the waiting queue. **"Take a project offline" (≈ 4 KB) moved** |
| meter.js | 33.0 | the rail pill, the per-reply token line |
| access-rules.js | 31.4 | the rules every check uses |

The CSS: features.css (100 KB), polish.css (83 KB) and look.css (58 KB) are the largest. About 9–10 KB of each of the first
two are Lab rules, but they sit in the middle of their files' cascade; moving them would change which rule wins for
equal selectors somewhere, which can only be proven with a visual diff of every screen. Not moved this round (the CSS
budget, 415 of 420 KB, still has room).

The round-128+ code the brief points at (tools hooks, `-hook.js`, `three-*-hook.js`, projects / project-brief,
nextstep, the Lab's helpers) is already in lazy groups: none of it is in `index.html`. What was "Lab code before the
Lab" on the first screen was the keys sheet's Lab lines and /scene, /scene-timeline: both moved.

## What moved

All five are new lazy groups in `lazy-data.js` (manifest rewritten with `node dev/lazy-manifest.js`; `docs/lazy-groups.md`
has a line for each), each with a `lazy-at.js` tag right where its code used to run, so the stand-ins come out in the old
order.

1. **`keyslines`** (keys-lines.js, tier 'soon'): 199 of the keys sheet's lines (Menus, Chat box, the Lab, its timeline,
   sliders & layers, the effects picker, Present, Nodes, Command bar, Right-click…), split off keys-ui.js's `register()`.
   - keys-ui.js keeps the first lines (Hidden buttons, then Everywhere up to the two system-wide keys, which read ⌃⌥H / ⌃⌥I on a
     Mac: a stand-in recorded on Linux could not match them), the reveal, the badges, the ⌨ button and the sheet.
   - Order: keys-ui.js added its lines as the page loaded, while stand-ins' keys lines usually come at DOMContentLoaded.
     A new group flag, `keysNow` (lazy.js `stubNow`), registers this group's keys stand-ins at its `lazy-at.js` tag,
     right after keys-ui.js, so the Keys list (and the sheet's areas) keep their exact order.
   - The sheet waits for the group: `KeysUI.open()` loads `keyslines` first when it is not in yet (once it is in, it
     opens at once, as before), so the sheet always shows every line with its own run / when.
   - lazy.js fix found on the way: when a group loads, a stand-in line is now filled by the *first* real line with
     those keys, as Keys.add keeps the first of two (keys-lines.js has two "Chat box · Tab" lines; the second one used
     to overwrite the first). It only matters for a group with two lines with the same keys.
2. **`scenecmds`** (chat-scenes-cmds.js, 'soon'): `/scene` and `/scene-timeline`, split off chat-scenes.js. They already
   loaded the Lab before doing anything; they read the links through `ChatScenes` (and its new `_cmd` helpers: lab,
   freshScene, draftSketch, titleOf, threeAgent). The links object is read fresh each time (it is replaced when the other
   computer's arrive).
3. **`accessui`** (access-ui.js, 'soon'): a chat's Access panel, the activity log and AI setup's "Files on this computer"
   box, split off access.js. `Access.panel / logPanel / aiSection` are forwarders: a plain call once the group is in (the
   same return value as before), a load-then-call before. `options` (⋯ AI setup, which calls `Access.aiSection`
   synchronously) now lists `accessui` in `after`. Every check, ask, card, badge and menu row stays in access.js.
4. **`offlineprep`** (offline-prepare.js, 'use'): "Take <project> offline". `Offline.prepare(project)` loads it and returns
   the same dialog (it already awaited the `projects` group first).
5. **`makesview`** (makes-view.js, 'soon'): Makes on the Commands page (the list section, a make's detail, "Every make") and
   `/makes`, split off makes.js. `cmdpage` now lists `makesview` in `after`, so the Commands page's section / pick / menu
   hooks (registered by makes.js as before, in the same order) stay plain calls. `Makes.show()` loads the group first;
   a change repaints the page only once it is in (the page cannot be open before). `/makes` is registered at
   DOMContentLoaded as before (its stand-in is a `dcl` one). The store, rooms, cards, the hooks and `three_make` stay.

Main process: nothing changed.

## Keeping behaviour identical: how it was checked

- **Registries, both trees side by side** (a `dev/smoke.js` script, not added to the repo): every keys-sheet line (area,
  keys, words, `when`, `sel`), every command (name, aliases, area, args, description) and every Ctrl/⌘+K line, dumped once
  the first screen settled, once every 'soon' group was in and once the Lab, `options` and `offlineprep` were in too:
  **identical** on 222bd29b and this branch (502 keys, 955 commands, 1,406 actions, in the same order). The only line
  that moved between runs is the chats panel's "Drag a chat onto a 📁 folder", which panel.js adds whenever its search
  box is built: it lands at a different place from run to run on both trees.
- **Every group held back** (`lazy.hold`): Ctrl/⌘+/ before `keyslines` is in loads it and opens the sheet with all its
  lines; `/makes list`, `/scene`, `/scene-timeline` are listed as stand-ins and the first `/makes` runs the real command;
  `Access.panel()` before `accessui` opens the same panel. No lazy global is touched while the first screen is built
  (`Lazy.misses()` empty at the first paint).
- `Access.aiSection()` returns AI setup's box synchronously once the group is in (as ⋯ AI setup uses it).

## Tests

- `node dev/boot-test.js`: 3,158 checks, the new budget ✓
- `node dev/lazy-manifest.js` (rewritten), then `node dev/lazy-manifest.js --check` ✓ (names 955, aliases 337, actions 1,406,
  keys 502, apps 51, tools 8, duplicates 0)
- `flock /tmp/hearth-run.lock timeout 2700 node dev/run-checks.js --exact qa-commands qa-keys lazy fastboot unit:lazymanifest-test tour137 labload94 labchat92`
  with `HEARTH_THREE_DIR` set: **8/8 passed in 13 min**: qa-commands ✓, qa-keys ✓ (its usual skip: Board · Arrows), lazy ✓, fastboot ✓,
  unit:lazymanifest-test ✓, tour137 ✓, labload94 ✓, labchat92 ✓
- `node dev/slim116-test.js` ✓ (7,102 checks), `node dev/selfmap118-test.js` ✓
- Node scans for the touched files (fast, no app): nativefeel-test ✓ (the ⌃⌥H line is still in keys-ui.js), access-test ✓,
  errorcalm-scan ✓, datasafe-scan ✓. chatwin-scan reports 5 files not in its audit (nextstep.js, projectbrief.js,
  projectbrief-draft.js, tools/three-refmatch.js, tools/three-replydiff.js): the same 5 on 222bd29b, none touched here.

## The new budget

`dev/boot-test.js`: `BUDGET = { scripts: 62, jsKB: 1547, sheets: 27, cssKB: 420 }` (1,537 KB of code + 10 KB headroom; the
scripts count stays 62 because every move was a part of a file, not a whole file).

## For the patch notes
- Hearth has less to read before its first picture (about 49 KB): most of the keys sheet's lines, the Access panel and
  activity log, the Makes page, /scene and "Take a project offline" now load just after the start.
- Nothing changes in use: every key, command, Ctrl/⌘+K line and menu works from the first moment and looks the same. The
  keys sheet (Ctrl/⌘+/) still lists every key in the same order.
- New features have room on the first screen again.

## For Codex
No Codex-owned file was touched (astra*, codex-*, projects*, project-workspace*, sync-engine.js, cloud-files.js,
workbench-*, engine-watch), and nothing in three-direction*, collab-eyes.js, credits*, Swarm / manager / missions, or the
cuelooks139 files (tools/three-sandbox.html, three-export.js).
Things Codex code may meet:
- `Access.panel(agentId)`, `Access.logPanel(agentId)`, `Access.aiSection(agentId, opts)` return what they did once the
  `accessui` group is in (a calm moment after the start); before that they return a Promise of it. Code that needs
  `aiSection` synchronously should load after `accessui` (as `options` now does).
- `Offline.prepare(project)` (projects.js / projmenu.js menu rows) is unchanged for callers: it was already async.
- `Makes.show(id)` is unchanged (async). The Commands page's group now loads after `makesview`.
- `ChatScenes._cmd` and `Access._ui` / `Makes._page` are internal hand-offs to the split files, not APIs.
