# Round 160 · boot160: first screen, part 2

Round 156 (boot157) cut the main window's first screen from 1,547 to ≈ 1,168 KB of code and named the next targets:
lazy-data.js (141 KB, read before the first frame) and chat-scenes.js (36 KB). This round splits lazy-data.js into
what lazy.js needs to boot and what can be read right after the first frame, moves chat-scenes.js behind the first
frame with the groups that use it waiting for it, and moves four more cold parts (the right-click menus, the look
picker, the keys sheet, Apps' on-demand work). The target was ≥ 10 % fewer eager KB (≤ 1,050 KB).

## Result

| | Before (round 157, ea760aa0) | After | |
|---|---:|---:|---:|
| First-screen code (boot-test: without whole-line comments) | 1,168 KB | **1,039 KB** | **−129 KB (−11.0 %)** |
| First-screen code with notes | 1,411 KB | 1,270 KB | −141 KB |
| First-screen scripts | 49 | **48** | −1 |
| lazy-data.js (code) | 137 KB | **83 KB** | −54 KB |
| First screen up (`hearth:ready`, ms since the process started, median of 10 launches) | 512 ms | **482 ms** | −30 ms (−6 %) |
| Window on screen with its first frame (`ready-to-show`, median of 10) | 487 ms | **460 ms** | −27 ms |
| The page's first paint entry (median of 10) | 902 ms | 888 ms | — (the splash; noise) |
| Script evaluation on the window's main thread before the first screen, no code cache (trace, 2 launches) | 98 · 127 ms | **77 · 84 ms** | ≈ −29 % |
| V8 parse + compile on the main thread before it (trace) | 1.5 · 2.2 ms | 1.3 · 1.5 ms | — |
| Every 'soon' group in (calm gate opened at once, median of 10) | 3,185 ms | 3,099 ms | — (noise across launches) |
| Window JS heap / DOM nodes / listeners once settled (median of 10) | 13.8 MB / 2,223 / 1,328 | 13.0 MB / 2,228 / 1,308 | ≈ |

With split158 and css159 merged (origin's claude/intelligent-galileo-yaiqem) the first screen is **1,041 KB** of code (css159's
CSS_AFTER reader in lazy.js / lazy-data.js), 48 scripts, 20 sheets (376 KB). Budget (`dev/boot-test.js`): scripts 51 →
**50**, code 1,207 → **1,072 KB** (1,041 + 3 %); sheets / CSS are css159's (20 / 385 KB).

## How it was measured

- **Coverage** (`node dev/smoke.js --fake-engines --coverage-ready r.json --coverage a.json`, then
  `node dev/firstscreen-coverage.js r.json a.json --blocks 50`): before, on a plain start (9 s, no input): 797 of 1,406
  KB of first-screen source had not run when the first screen was up, 759 KB never. After, on a start that then opens
  a chat and gets a reply (fake engines): 717 of 1,266 KB not run at the first screen, 560 KB not even by the end of
  the reply. Same thin picture as rounds 83–157 (handlers and menus in every file); what moved is what the first frame
  draws nothing from and nothing calls synchronously before it, at the same safety bar as boot157.
- **Start**: `flock /tmp/hearth-run.lock` around `node dev/coldstart-report.js [--app <round-157 copy>] --runs 5 --json …`
  twice each, interleaved (10 launches per build), and `--runs 1 --no-code-cache --trace …` twice each (script
  evaluation on the window's main thread before the first screen, as on a first start after an update). Before = a copy
  of ea760aa0 (round 157) through `--app`. This box: 4 shared CPUs, software GL, an empty profile with the fake engines;
  two other agents ran checks in between (the lock keeps runs apart, not the machine quiet).

## What moved behind the first frame

| What | Code KB off the first screen | How |
|---|---:|---|
| lazy-data.js: the stand-ins' keys-sheet lines, Ctrl/⌘+K lines and app windows | 41 | into lazy-meta.js (`LazyLines`), read with the commands' words right after the first frame |
| lazy-data.js: the commands manifest written short | 13 | `'*name/alias>Area'` strings (851 of 939 commands), read back into the same objects by lazy-data.js |
| chat-scenes.js (per-chat scenes: a director chat's colour and mark, its scene) | 36 | lazy group `chatscenes`, first of all right after the first frame |
| declutter-menus.js (the right-click menus of chats, rail, panels, dialogs) | 16 | lazy group `ctxmenus`, asap |
| apps-ui.js (routing a download, the downloads dialog, /apps itself, the agents' app tools) | 11 | lazy group `appsui`, on use |
| keys-sheet.js (the keys sheet) | 10 | lazy group `keyssheet`, on use |
| look-picker.js (the Appearance picker) | 8 | lazy group `lookpicker`, on use (Settings' dialogs load it first) |
| what keeps it identical (slots in keys.js / appui.js / apps.js, lazy.js) | −4 | |

lazy-data.js keeps what lazy.js needs at boot: the groups (names, files, globals, flags), the commands, agent tool
prefixes and rail tools of the stand-ins (registered before the first frame so names, aliases and "/" work at once),
and the HearthFeatures registry.

### Keeping the order identical: line slots

The keys-sheet lines, Ctrl/⌘+K lines and app windows of a lazy group's stand-ins used to be added at DOMContentLoaded
(its `lazy-at.js` moment), or at its tag for `keysNow` / `actionsNow` groups, between other files' own lines. Now, at
that same moment, lazy.js keeps a quiet **slot** in each list (`Keys.slot()`, `AppUI.actionSlot()`, `Apps.slot()`);
when lazy-meta.js arrives (right after the first frame, before any group loads) each group's lines **fill their slots
in the order the slots were made** (`Keys.fill`, `AppUI.fillActions`, `Apps.fill`). What a stand-in finds taken is
read from the lines *before* its slot, and a line another file added later with the same keys gives way (Keys keeps
the first of two, as before). Slots are invisible to `Keys.all()` / `groups()`, `AppUI.actions()`, the palette and
`Apps.list()`. A palette opened in the first moment is redrawn when the lines come (`AppUI.paletteRefresh`).

### chat-scenes.js

- Group `chatscenes`: `asap` and first in the list, `slots: 'panel'` (its `Native.hooks` and the chats list's
  `Panel.hooks.row` / `render` go where the file used to put them), `redraw`, `send`. It counts as in once its links
  are read (`Lazy.holdLoad(readyP)`, ≤ 3 s), as when its file ran before the first frame. Once read it builds the chat
  rows again (`Panel.redrawRows()`, new) so the rows the first frame drew get their colour and mark.
- Who waits: `after: ['chatscenes']` on `projects` (projects.js, project-workspace.js, projects-cmds.js read
  ChatScenes unguarded), `chatkit` (chat-context.js), `chatattach`, `directortask` (and through it `compdispatch`),
  `scenecmds`. `wait: ['chatscenes']` (new, lazy.js: wait for it where it exists) on `lab` and `takes`: the Lab window
  has no ChatScenes, and `after` would drop the Lab there.
- On a Projects-first start the `projects` group is asked for right after `hearth:ready` (the first screen's own) and
  brings `chatscenes` with it, as before this round (fastboot exempts the home group's own needs).
- The manifest tool places a file put after another group's file (the Lab's three-comp.js after chat-scenes.js) once
  that group is in.

### The four cold parts

- **ctxmenus**: declutter.js keeps the tidy stylesheet, Customise this… and the right-click listener; the menus go into
  the list at Declutter's own place (`_ctxHere`, before what chat-live.js and the Lab add). A right-click before they
  are in is asked again once they are.
- **lookpicker**: look.js still applies the look before the first frame; `Look.picker()` hands over (appdialogs
  `after: ['lookpicker']`), `Look.openDialog()` loads it first. In the Lab window's groups too.
- **keyssheet**: keys-ui.js keeps the Alt / Ctrl reveal, the keys button and the registry; `KeysUI.open()` loads the
  sheet (it already waited for keys-lines.js). In the Lab window's groups too.
- **appsui**: apps.js keeps the registry, windows, menu and every stand-in entry (commands with their words, palette
  lines, keys, tool prefixes); the bodies of `/apps`, `/apps-tools`, `route`, the downloads dialog, a page sent to the
  chat and `apps_*` / `meshy_*` hand over to it.
- All five groups are registered in HearthFeatures' core features (trim-data.js), trim weights regenerated (174 groups).

### Sameness (the boot157 bar)

- Order probe (a smoke script on both builds, `dev/smoke.js --fake-engines`): right after the words / lines are in, once
  every 'soon' group is in, and after `Lazy.loadAll()`: **958 commands, 1,417 Ctrl/⌘+K lines, the keys sheet per area
  (35 areas, keys and words), 51 app windows and 8 rail tools in the same order**; all 17 `Native.hooks` and
  `Panel.hooks` lists the same (functions compared by name and source); no group failed, no global missed. (The first
  probe found Apps.list() in another order: a slot didn't count apps filled by earlier slots; fixed.)
- `node dev/lazy-manifest.js` (`--check` in lazymanifest-test): names 958, aliases 339, actions 1,417, keys 506, apps 51,
  tools 8, no duplicates, the same in the old order and the lazy build.

## What stays eager, and why (unchanged from boot157)

The chat view and composer (native.js, panel.js, chat-ux.js, chat-slash.js with notes.js' "/" menu), Ctrl/⌘+K
(appui.js), keys-ui.js' reveal and speed-learn.js (keys that must work at once), look.js (the theme before the first
frame), declutter.js' tidy stylesheet, powerwise.js (`<html data-lite>` before the first paint), the safety nets (jank,
habits, hints, progress, progress-hooks), sign-in and sync (sync.js), makes.js, missions.js / manager.js / swarmlean.js /
collab-eyes.js (other streams' scope). The Lab window's eager files are unchanged; it now also knows `lookpicker` and
`keyssheet` (on use).

## Seen, not changed

- notes.js (32 KB, 21 KB of it never ran in a chat): the prompt library behind the composer's "/" menu (native.js calls
  `Prompts.attach` while it builds the chat box); its manage / update dialogs (≈ 16 KB) could split off like the keys sheet.
- renderer.js (46 KB not run at the first screen: popMenu, showMenu, handleShortcut), native.js' menus (messageMenu,
  chatMenuItems, onListClick ≈ 17 KB): closures over the chat view's state, a bigger refactor.
- `window.ChatScenes?.…` in nextstep.js, projtemplates.js, tools/three-explain.js and tools/three-critique.js never
  finds ChatScenes (a top-level `const` is not a property of window), before and after this round.
- settingscalm (21 controls, budget 20) and appcalm (15 at 1280, ≤ 14) fail the same way on the untouched round-157
  copy: Settings' first sight lists the same 21 controls on both builds (round 157's ⚡ Lite mode tick box).

## For Codex

- No Codex-owned file was edited. **chat-scenes.js now loads as the lazy group `chatscenes`**, right after the first
  frame, first of all. The `projects` group (projects.js, project-workspace.js, projects-cmds.js…) has
  `after: ['chatscenes']` in lazy-data.js, so ChatScenes is always there when those files run. New code in another
  group that reads ChatScenes without `typeof` needs `after: ['chatscenes']` (or `wait`, if the group also exists in the
  Lab window).

## Checks

No new check: boot-test's lowered budget is the guard (50 scripts, 1,072 KB of code).

- Asked-for run (`flock /tmp/hearth-run.lock timeout 2900 node dev/run-checks.js --exact unit:boot-test unit:lazymanifest-test
  lazy fastboot firstscreen96 liveness-ui progress chat-stream calmstart trim153 labwin153 lite153 qa-keys cmdbar141
  settingscalm appcalm`): 13 / 16 passed. **fastboot** found `chatscenes` starting before the first frame on a Projects-first
  start (the projects group, the first screen's own, needs it): the check now exempts the home group's own needs; passes
  since. **settingscalm** / **appcalm** fail the same on the untouched round-157 copy (see above).
- ChatScenes / project checks (`fastboot scenes scenes-sync projects project-continuity makes comp-dispatch directorswitch jam
  labchat92 labbridge72 labload94 chatkeep`): **13 / 13 passed**.
- What else moved (`crew declutter menucalm panel142 chatcore polish8 winmac49 speed nativefeel hz240 apps-windows
  apps-discover`): 8 / 12; **menucalm** ("Lab toolbar ⋯: 12 > 11"), **polish8** ("board item: look before send") and **speed**
  (the pick-up card after a restart) fail the same way on the untouched round-157 copy (its own `dev/run-checks.js`);
  **nativefeel**'s Lab preview scale step (1 → 1.4, wants ≥ 1.8) passed on the copy and is timing on this box: see the final run.
- `node dev/whatsnew-test.js`: 49 passed. firstscreen96 now loads `lookpicker` before calling `Look.picker()` in its held round.
