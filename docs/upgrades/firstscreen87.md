# firstscreen87: 68 KB of room on the first screen (round 87)

The first-screen code budget (`dev/boot-test.js`: what the window parses before its first frame, without whole-line
comments) was at 1,809 of 1,810 KB after round 86, so no feature could add first-screen code. This stream used
firstscreen83's tools to find the first-screen code that never runs before the first screen, moved three whole files
that aren't needed before it into lazy groups, and lowered the budget.

**Result: 1,809 → 1,741 KB of code (−68 KB), 71 → 68 scripts. Budget 1,810 → 1,751 KB (10 KB headroom), scripts 71 → 68.**

## How it was measured
Two runs, 9 s each, no input, as in round 83: the heavy owner-like profile (`/tmp/hearth-bigprofile70`, Projects
first) and an empty profile (a chat first):

    node dev/smoke.js --data /tmp/hearth-bigprofile70 --coverage-ready r1.json --coverage a1.json --wait 9000
    node dev/smoke.js --coverage-ready r2.json --coverage a2.json --wait 9000
    node dev/firstscreen-coverage.js r1.json,r2.json a1.json,a2.json --blocks 60

1,337 of 2,115 KB of first-screen source (with comments) had not run at the first screen, 1,304 KB of it still not 9 s
later. Most of it is thin: event handlers, menus and commands spread over every file (the biggest single block left is
11.5 KB, access-rules.js's command classifier). So this round moved **whole files** whose code is only reached
through calls that can wait, not dialogs cut out of a file.

| First-screen file (cold KB at ready / file KB) | | |
|---|---:|---|
| native.js 152.5 / 209.3, renderer.js 44.7 / 70.3, chat-scenes.js 35.4 / 55.5, panel.js 21.3 / 49.1 | | the chat view's core, the rail: never moved |
| astra.js 104.3 / 141.6 | | Codex: not touched |
| access.js 53.6 / 65.4, access-rules.js 25.8 / 34.3 | | the permission checks on every send: kept (round 83's reason) |
| jam.js 46.0 / 55.6, missions.js 29.2 / 40.8, manager.js, swarmlean.js, collab-eyes.js | | creative-direction session / Swarm: not touched |
| notes.js 45.1 / 53.1 | | kept: Notes holds its store with StoreAck from the start (storeack77) |
| makes.js 38.8 / 52.5 (+ makes-core.js) | | kept: the chats list groups rooms under their make, projects read it |
| offline.js 31.0 / 40.0 (+ offline-core.js) | | kept: messages waiting for the internet go out by themselves from the start |
| **comp-dispatch.js 22.2 / 27.0** | | **moved** (group `compdispatch`) |
| **memorytidy-core.js 21.0 / 30.4** | | **moved** (group `memorytidycore`) |
| **updater.js 17.4 / 24.2** | | **moved** (group `updater`) |
| director-dock.js 15.0 / 18.9 | | kept: the Lab as the first screen attaches it before the first paint |
| routerlearn.js 12.9 / 20.3 | | kept: Smart reads what it learned on every send, synchronously |
| habits.js 10.4 / 14.2 | | kept: it counts every error from the start |

## Upgrades
### The first screen
1. **Memory tidy's core loads after the first screen** (memorytidy-core.js, lazy group `memorytidycore`, an idle
   moment after the first screen). −25.5 KB. It is the pure part that keeps saved memory small: a fact an AI saves
   with `<remember>` replaces the one it repeats or contradicts. native.js's `rememberFacts` / `forgetFacts` (both
   already async) now wait for the group before they read memory, so a fact saved in the first second is tidied
   exactly as before, never appended raw. ⋯ AI setup › Memory › Tidy memory (the `options` group) loads after it,
   and Recent changes' undo of a tidy (undoall.js) loads it before it checks.
2. **The updater loads right after the first frame** (updater.js, group `updater`, asap). −20.9 KB. Everything it
   does at start is after the first screen anyway: the 25 s look for updates, the note after an update, and putting
   back each AI's open chat after an update's reload (at `hearth:ready`, or at once when it loads after it). `/update`
   and its two Ctrl/⌘+K lines (Patch notes, Go back to the previous version) are stand-ins until it's in. The groups
   that call `Updater` directly (activity, notify, firstrun, appsearch, whatsnew) list it in `after`; Settings (its
   What's new row) and a local answer's "patch notes" load it first.
3. **Comp dispatch loads right after the first frame** (comp-dispatch.js, group `compdispatch`, asap). −24.9 KB.
   `/dispatch` and its Ctrl/⌘+K line are stand-ins until then; `three_do comp` (the directors) and `/comp parts…` load
   it before they answer. A comp card in the chat on screen at the start (rare: a director chat that dispatched parts)
   shows its head ("◫ Comp · 3 parts") until the group is in, a moment later, then the whole card; the swap is the
   same node swap the card's own repaint always did.
4. **The first-screen budget is lowered to 1,751 KB** (1,741 + 10 KB headroom) and 68 scripts.

### Kept exactly as before
5. The moved files are unchanged. What changed is who waits for them: native.js (two `await`s and the comp card's
   stand-in head), undoall.js (one load in the tidy's check), tools/three-comp.js (two loads), appui-dialogs.js (one
   load in Settings), localanswers.js (one load), and `after` on five groups in lazy-data.js.
6. No CSS moved. The manifest (`node dev/lazy-manifest.js`) records the same names, aliases, actions, keys, apps,
   tools and no duplicates (957 / 340 / 1409 / 516 / 51 / 9 / 0). A first try put the Lab group `after` comp dispatch:
   that moved the Lab's files later in the recording and the manifest check caught it (/frame lost its alias), so the
   Lab loads it through three-comp.js instead.

## Not changed (reported)
- **director-dock.js (17.6 KB)** could go with a re-attach in tools.js, but when the Lab is the first screen its strip
  is attached before the first paint: it would come up a frame later. Left eager.
- **routerlearn.js (16.4 KB)**: router.js reads `RouterLearn.shifts()` synchronously on every send, so a message sent
  in the first moment would get Smart's pick without what it learned. Left eager.
- **Big dialogs inside first-screen files** (memory.js's editor 7.8 KB, look.js's picker 7.4 KB, the keys sheet 5.7 KB):
  their callers use them synchronously (the picker returns a node for Settings, the keys sheet toggles), so moving
  them would make a key or a click wait. The room this round needed came from the three files above.
- No Codex-owned file and none of the creative-direction session's files was touched. Nothing in storework.js or
  sync / Lab internals.

## Numbers
| What | Before (d3a02e4) | After |
|---|---:|---:|
| First-screen code (boot-test) | 71 scripts · 1,809 KB · 28 sheets · 423 KB CSS | 68 · **1,741 KB** · 28 · 423 KB |
| Budget | 71 · 1,810 KB | **68 · 1,751 KB** |
| Lazy groups | 127 | 130 (memorytidycore, updater, compdispatch) |

Startup was not A/B timed this round (round 83's perfguard run showed a 79 KB cut is below this box's noise); the gain
is room for the next features.

## Tested
- `node --check` on every touched file; `node dev/lazy-manifest.js` (✓ every list, dups 0); `node dev/boot-test.js`
  (3,039 checks, new budget).
- App checks (under `flock /tmp/hearth-run.lock`, ≤ 5 per run): **firstscreen87** (new, 38 steps), firstscreen83, lazy,
  calmstart, memorytidy, `dev/smoke.js` (no page errors), chatwindow72, projects, comp-dispatch, progress-comp,
  updater, whatsnew71: all pass.
- Unit: lazymanifest-test, boot-test, datasafe-scan, winmac-test, errorcalm-scan, storeack-scan, chatsafe-scan,
  chatwin-scan, memorytidy-test, powerwise-test: all pass.
- `adaptive-feedback` fails on "Deep budget not shown before sending" (visual feedback). It **fails the same way on the
  base** (d3a02e4, run from a clean copy), so this stream didn't cause it.

`dev/checks/firstscreen87.js` (group `firstscreen87` in dev/run-checks.js) proves each moved feature from the first
moment, once with its group loaded and once after a reload with every group held back (the first use loads it):
- memory tidy: a fact saved twice through `Native.rememberFacts` is kept once;
- the updater: `/update auto off|on` (command), its Ctrl/⌘+K lines (Patch notes opens the notes), the ⬆ rail button
  with a fake main two changes ahead (button: What's new opens with them), Settings' update row;
- comp dispatch: `/dispatch` (command) and its Ctrl/⌘+K line open the "Dispatch parts" box, a comp card in the open
  chat draws its head at once and then its two parts with their buttons, `three_do comp` reaches it.

## Files
- New: `dev/checks/firstscreen87.js`, `docs/upgrades/firstscreen87.md`.
- Changed: `index.html` (3 scripts out, 3 lazy-at tags), `lazy-data.js` (3 groups, 5 `after`s, manifest regenerated),
  `lazy-meta.js` (regenerated), `native.js`, `undoall.js`, `tools/three-comp.js`, `appui-dialogs.js`,
  `localanswers.js`, `dev/boot-test.js` (budget), `dev/run-checks.js` (group), `docs/lazy-groups.md`,
  `docs/upgrades/firstscreen.md` (history line).

## For Codex
Nothing: no Codex-owned file was moved or edited.

## For the patch notes
- Hearth's first screen is lighter again: about 70 KB less code is read before the window shows.
- The update button, comp dispatch (parts sent to other chats) and the part that keeps saved memory tidy now load a
  moment after Hearth opens instead of before it.
- Nothing looks or works differently: /update, /dispatch, their Ctrl/⌘+K lines, the ⬆ button and saved memory work
  from the first moment, as before.
- This makes room for the next features to start fast too.
