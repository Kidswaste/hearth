# firstscreen96: 62 KB of room on the first screen (round 96)

The first-screen code budget (`dev/boot-test.js`: what the window parses before its first frame, without whole-line
comments) was at 1,748 of 1,751 KB after round 95, so no feature could add first-screen code. This stream used the
round 83 / 87 tools again, moved four whole files and one block of a file that are not needed before the first screen
into lazy groups, and lowered the budget.

**Result: 1,748 → 1,686 KB of code (−62 KB), 68 → 64 scripts. Budget 1,751 → 1,696 KB (10 KB headroom), scripts 68 → 64.**

## How it was measured
Two runs, 9 s each, no input, as in rounds 83 and 87: the heavy owner-like profile (`/tmp/hearth-bigprofile70`,
Projects first) and an empty profile (a chat first):

    node dev/smoke.js --data /tmp/hearth-bigprofile70 --coverage-ready r1.json --coverage a1.json --wait 9000
    node dev/smoke.js --coverage-ready r2.json --coverage a2.json --wait 9000
    node dev/firstscreen-coverage.js r1.json,r2.json a1.json,a2.json --blocks 60

1,282 of 2,046 KB of first-screen source (with comments) had not run at the first screen, 1,251 KB of it still not 9 s
later. As round 87 found, most of it is thin (handlers and menus in every file; the biggest single block is still
access-rules.js's command classifier, 11.5 KB). So again this round moved **whole files**, picked by cold KB and by
whether anything has to happen through them before the first screen.

| First-screen file | cold KB at ready / file KB | code KB | |
|---|---:|---:|---|
| native.js, renderer.js, chat-scenes.js, panel.js | 153.5 / 210.5 … | | the chat view's core, the rail: never moved |
| astra.js | 104.3 / 141.6 | | Codex: not touched |
| access.js, access-rules.js | 79.4 / 99.7 | | the permission checks on every send (round 83's reason) |
| jam.js, missions.js, manager.js, swarmlean.js, collab-eyes.js | | | creative-direction session / Swarm: not touched |
| declutter.js | 34.3 / 54.6 | 48.1 | **its Lab menus moved** (8.6 KB, with the Lab); the rest builds the tidy stylesheet and every other right-click menu from the start |
| keys-ui.js | 18.6 / 53.0 | 48.8 | kept: the keys sheet toggles at once (Ctrl+/), and its 28 KB key registry feeds the lazy manifest's key stand-ins |
| sync.js | 29.5 / 39.4 | 35.3 | kept, see below |
| **director-dock.js** | 15.2 / 19.1 | 17.3 | **moved** (group `directordock`) |
| **progress-ui.js** | 13.0 / 16.4 | 14.3 | **moved** (group `progressui`) |
| routerlearn.js | 12.9 / 20.3 | 16.0 | kept: Smart reads what it learned on every send, synchronously (round 87's reason) |
| **director-task.js** | 11.4 / 15.1 | 12.5 | **moved** (group `directortask`) |
| hints.js | 10.9 / 18.6 | 13.1 | kept: the one-hint-at-a-time queue takes notes from the start; findmem92's part is its scheduler |
| speed-learn.js | 9.2 / 13.4 | 11.6 | kept: Ctrl/⌘+Alt+1…9 (your one-key routines) is its own key listener, and it counts what you do from the start |
| **decide.js** | 8.4 / 12.2 | 10.9 | **moved** (into group `assist`) |
| habits.js, offline.js, notes.js, makes.js | | | kept (round 87's reasons) |

## Upgrades
### The first screen
1. **The docked director's strip loads right after the first frame** (director-dock.js, group `directordock`, asap).
   −17.3 KB. Round 87 kept it because a Lab first screen attached it before the first paint; since labload94 every
   tool with a dock (the Lab, Forgeheart) is itself a lazy group, so no dock exists before the first frame. tools.js
   attaches the strip the moment the group is in if a dock was shown first (a lost race: the Lab loading before it);
   right-click on the dock, the keys sheet's Alt+Shift+Z / Y lines and chat-scenes.js's repaint wait for it or skip
   while it isn't in. The directors' /commands (`directorcmds`) load after it.
2. **A director chat's task state loads right after the first frame** (director-task.js, group `directortask`, asap).
   −12.5 KB. `/task`, and the directors' `three_task` / `three_run` tools are stand-ins until then. An ask the owner
   sends a director before it is in is kept for it (a five-line hook in tools.js, `window.DirectorTaskEarly`), so the
   chat's goal is recorded exactly as before. Comp dispatch (which reads it) loads after it.
3. **The progress bars on screen load right after the first frame** (progress-ui.js, group `progressui`, asap).
   −14.3 KB. The model (progress.js) and what feeds it (progress-hooks.js) stay from the start, and so does what Hearth
   learned of how long things take: progress-hooks.js now configures it, not the bars. Anything already in progress
   gets its bars when the group is in; the first thing in progress loads the group if it isn't in yet. `/progress` and
   its Ctrl/⌘+K line are stand-ins until then.
4. **Let Astra decide loads with Assist** (decide.js, now the first file of group `assist`, asap). −10.9 KB. Assist
   already added kinds to it; now they come in together. `/decide` and its four Ctrl/⌘+K lines are stand-ins; the
   ✦ Let Astra pick buttons (Settings › Look, the Lab's frame menu, the effects picker) are always there and load the
   group on click; the Lab sequence adds its "arrangement" kind once the group is in (`Lazy.when`).
5. **The Lab's right-click menus load with the Lab** (declutter-lab.js, the last file of group `lab`). −8.6 KB from
   declutter.js. The toolbar, sliders, layers, console, effects picker and timeline exist only once the Lab is in, so
   their menus come with it, still ending with Customise this…; `Declutter.labToolbar` is set there.
6. **The first-screen budget is lowered to 1,696 KB** (1,686 + 10 KB headroom) and 64 scripts.

### Kept exactly as before
7. The moved files are unchanged except for one line each (director-task.js takes the asks kept for it, progress-ui.js
   no longer configures the learned times). The Lab block moved whole. Every command, Ctrl/⌘+K line, key and tool
   keeps its name. The manifest (`node dev/lazy-manifest.js`) records the same names, aliases, actions, keys, apps,
   tools and no duplicates (957 / 340 / 1409 / 516 / 51 / 9 / 0); the Lab's two files that sat after director-task.js
   (`places`) now sit after chat-scenes.js, the file before it.
8. No CSS moved.

## Not changed (reported)
- **sync.js (rounds 92–95).** The chip wording (`chipOf`, `shortLine`) draws the rail's sync chip at the first paint,
  and the compare notes (`notice()`, ≈ 1 KB) run on every status from the start, so a version kept aside is said when
  it happens. `Sync.whose` is one line (0.6 KB) used by the lazy sync panel, the conflicts list and keptaside, and
  `dev/aside95-test.js` reads its rule from sync.js. Together under 3 KB of cold code, in files the checkfix96 stream
  may need to touch: left where they are. The bigger cold parts (Sync › Turn on…, its Settings section, its commands,
  ≈ 10 KB) are possible for a later round, once checkfix96 is merged.
- **lab-intent.js** (labload94, `labintent`, asap) is already lazy: 9 KB with notes, read right after the first frame,
  not counted in the budget. It is needed that early: it decides per start when the Lab loads and watches for the
  pointer on a button that opens it. Nothing to gain by moving it.
- **routerlearn.js**, **hints.js**, **speed-learn.js**, **keys-ui.js**: kept, for the reasons in the table.
- No Codex-owned file and none of the creative-direction session's files was touched.

## Numbers
| What | Before (b960e91) | After |
|---|---:|---:|
| First-screen code (boot-test) | 68 scripts · 1,748 KB · 28 sheets · 423 KB CSS | 64 · **1,686 KB** · 28 · 423 KB |
| declutter.js (code) | 48.1 KB | 39.5 KB (+ declutter-lab.js 8.9 KB, with the Lab) |
| Added to first-screen files | | tools.js +0.6, progress-hooks.js +0.2, lazy-data.js +0.9 KB |
| Budget | 68 · 1,751 KB | **64 · 1,696 KB** |
| Lazy groups | 133 | 136 (directordock, directortask, progressui) |

Startup was not A/B timed (round 83 showed a cut this size is below this box's noise); the gain is room for the next
features.

## Tested
- `node --check` on every touched file; `node dev/lazy-manifest.js` (rewritten, then `--check`: ✓ every list, dups 0);
  `node dev/boot-test.js` (3,100 checks, new budget).
- App checks (under `flock /tmp/hearth-run.lock`, ≤ 5 per run): **firstscreen96** (new, 38 steps), firstscreen87,
  firstscreen83, lazy, calmstart, chatwindow72, projects, sync72, syncpanel92, keptaside94, labload94, and the moved
  features' own checks: director-dock, decide, progress, declutter: all pass.
- Unit: lazymanifest-test, boot-test, datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan,
  chatwin-scan: all pass.
- checkfix96's checks (sync72-test --thread, the keptaside94 preset, labcompile90) were not run or touched.

`dev/checks/firstscreen96.js` (group `firstscreen96` in dev/run-checks.js, with the fake engines) proves each moved
feature from the first moment, once with its group loaded and once after a reload with every group held back (the
first use loads it):
- the progress bars: a thing in progress shows on the rail's dot and as a bar on the thing itself, `/progress`
  (command) and its Ctrl/⌘+K line open the list; after the reload, the learned times are read while the bars' group
  is still held;
- the task state: an ask sent to the Three Director is kept (with the group still held at the send), `three_task`
  and `/task` read it;
- the dock: the Lab's docked director gets its strip and chips, Alt+Shift+D (key) folds and opens it;
- the Lab's menus: right-click on the Lab's toolbar opens its menu (▶ Run … Customise this…);
- Let Astra decide: the look picker's ✦ button (button), `/decide` (command), its Ctrl/⌘+K lines, Assist's and the Lab
  sequence's kinds;
- no app code touches the moved globals before their group.

## Files
- New: `declutter-lab.js`, `dev/checks/firstscreen96.js`, `docs/upgrades/firstscreen96.md`.
- Changed: `index.html` (4 scripts out, 2 lazy-at tags, 1 tag extended), `lazy-data.js` (3 groups, `assist` +
  decide.js, `lab` + declutter-lab.js, 2 `after`s, manifest regenerated), `lazy-meta.js` (regenerated),
  `declutter.js`, `tools.js`, `progress-hooks.js`, `progress-ui.js`, `director-task.js`, `keys-ui.js`,
  `chat-scenes.js`, `look.js`, `tools/three.js`, `tools/three-fx.js`, `tools/three-seq.js`, `dev/boot-test.js`
  (budget), `dev/run-checks.js` (group), `docs/lazy-groups.md`, `docs/upgrades/firstscreen.md` (history line).

## For Codex
Nothing: no Codex-owned file was moved or edited. astra.js's handover (`typeof DirectorTask`) and comp-dispatch.js
work as they are: both groups load right after the first frame, and comp dispatch now loads after the task state.

## For the patch notes
- Hearth's first screen is lighter again: about 60 KB less code is read before the window shows.
- The director's strip beside the Lab, the progress bars, "Let Astra decide" and the Lab's right-click menus now load
  a moment after Hearth opens instead of before it.
- Nothing looks or works differently: every button, key and command works from the first moment, as before.
- This makes room for the next features to start fast too.
