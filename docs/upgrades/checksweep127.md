# Check sweep, third part (round 127, checksweep127)

Rounds 123 and 125 (docs/upgrades/checksweep123.md, checksweep125.md) swept the app checks from `a11y` to `workspace-nav`
and left 114 under "Not swept". This round picked up at `labload94`, ran as many as fitted in about 3 hours, and fixed
search113, which round 125 had left open. It also deleted 5 redundant checks, because the owner wants less testing.

**Status: partial sweep.** 72 checks were taken up: 70 ran (67 pass on their last run) and 2 opt-in ones were skipped. 5 were deleted. The one fix to the app is search113's: an archived project's chat in Ctrl/⌘+K. The rest are listed under "Not swept" at the end.

How it ran: the same as rounds 123 and 125. `flock /tmp/hearth-run.lock timeout 1700 node dev/run-checks.js --out
<scratch> --exact <8–15 names>` with `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1
CHATWINDOW86=1 BIGCHAT84=1`, one batch at a time in the background, on the 4-core box (load about 2, about 4 GB of disk
free). Each failure was rerun once, after a fix when there was one.

Classes: **a** obsolete · **b** check out of date · **c** app bug · **d** flaky or load / timing · **?** not resolved in
this round (see "Open failures").

## What broke the checks (the patterns)

Fewer than before: most of this part is the Lab, which round 116 didn't change.

1. **The chats list shows the open project's chats** (motionpolish, search113's chats filter). Round 123's pattern 2.
   motionpolish's menu stretch right-clicked a row of the list, and the list had none ("Cannot read properties of
   undefined (reading 'getBoundingClientRect')"). **Fix:** the check opens a project of its own and `Projects.add`s
   its three chats (`{ links: false }`). search113 now opens each chat's own project before it types its words.
2. **An archived project's chat** (search113). The owner chose the plain behaviour: in Ctrl/⌘+K it shows its
   project's name with "(archived)". The app didn't (see "App bugs, fixed").

## Results

Every check that ran, with each run in order. The time is the last run's.

| check | result (runs in order) | time | class | action |
|---|---|---|---|---|
| labload94 | pass | 48 s |  |  |
| labmaterials | pass | 71 s |  |  |
| labmemory | pass | 135 s |  |  |
| labmodels99 | pass | 65 s |  |  |
| labpace | pass | 105 s |  |  |
| labplay55 | pass | 88 s |  |  |
| labrecipes | pass (one step skipped by the check itself) | 58 s |  |  |
| labscrub | pass | 63 s |  |  |
| labsearch | pass | 46 s |  |  |
| labshader | pass | 49 s |  |  |
| labshapes | pass | 75 s |  |  |
| labsmooth54 | pass | 114 s |  |  |
| labstage | pass | 93 s |  |  |
| labstartfast | pass | 224 s |  |  |
| labtemplates | pass | 50 s |  |  |
| labtools73 | pass | 149 s |  |  |
| labtype240 | fail → fail | 271 s | ? | a still type scene isn't held within 24 frames of a message (drawn 48–60, twice); see Open failures |
| labvariations | pass | 50 s |  |  |
| labvisualizers | pass | 70 s |  |  |
| layer-masks-controls | pass | 43 s |  |  |
| layergroups | pass | 95 s |  |  |
| lightweight | fail → fail | 162 s | ? | three budgets just over, the same twice (observers +21 / 19, 414 / 400 detached ⋯ AI setup nodes, 4 → 6 processes); see Open failures |
| live | pass | 86 s |  |  |
| liveness-perf | pass | 42 s |  |  |
| liveness-ui | pass | 88 s |  |  |
| longrun91 | skipped (opt-in) | 0 s |  |  |
| lookmatch | pass | 55 s |  |  |
| mainhang65 | pass | 189 s |  |  |
| memory48 | pass | 255 s |  |  |
| modeltex100 | pass ("can't tell under load" noted by the check) | 79 s |  |  |
| moodqualities67 | pass | 42 s |  |  |
| motion | pass | 176 s |  |  |
| motion-in | pass | 80 s |  |  |
| motion-in-real | pass (skips itself: no MediaPipe files here) | 53 s |  |  |
| motion-render | pass | 286 s |  |  |
| motionpolish | fail → pass | 86 s | b | opens its own project with its three chats (the menu stretch found no row in the list) |
| multiformat | pass | 47 s |  |  |
| music | pass | 66 s |  |  |
| nativefeel | pass | 49 s |  |  |
| nodes-code | pass | 40 s |  |  |
| nodes-lab | pass | 58 s |  |  |
| nodes-shader | pass | 39 s |  |  |
| offmain | pass | 48 s |  |  |
| orb | pass | 94 s |  |  |
| packs | pass | 46 s |  |  |
| packs89 | pass | 41 s |  |  |
| particles | pass | 101 s |  |  |
| perf | pass | 65 s |  |  |
| perfectloop | pass | 77 s |  |  |
| perfguard | skipped (opt-in) | 0 s |  |  |
| physics | pass | 89 s |  |  |
| pinboard | pass | 63 s |  |  |
| playbudget | pass | 94 s |  |  |
| playlatency | pass | 287 s |  |  |
| playloop | pass | 51 s |  |  |
| playnotes62 | pass | 64 s |  |  |
| polish | pass | 46 s |  |  |
| polish8 | pass | 47 s |  |  |
| powerwise | pass | 325 s |  |  |
| presentready | pass | 152 s |  |  |
| progress | pass | 67 s |  |  |
| progress-comp | fail → fail | 54 s | ? | "each part's chat row has a bar while it works", the same twice; likely pattern 1 / 2 (the parts' chats aren't in the open project's list); see Open failures |
| publishkit | pass | 44 s |  |  |
| robust-lab | pass | 45 s |  |  |
| routine-feedback | pass | 58 s |  |  |
| scenedoctor | pass | 69 s |  |  |
| scenes | pass | 79 s |  |  |
| search113 | fail → pass | 73 s | b + c | app: an archived project's chat says "◆ Old archive (archived)"; check: each chat's project opened before the chats filter |
| seq-buttons | pass | 61 s |  |  |
| seq2 | pass | 68 s |  |  |
| seq2-scenes | pass | 84 s |  |  |
| seqguard-edit | pass | 64 s |  |  |

## Deletions

5 checks were deleted. None was in a `GROUPS` list of run-checks (they ran only in `all`). Each has a newer check that
covers the same thing:

| check | why it goes | covered by |
|---|---|---|
| smooth-app | round 8's idle / menu / dialog / toast smoothness report | idlecpu (idle), glass240 (menus, tooltips), motionpolish (openings), streamrender |
| smooth-lab | the Lab with the docked director while a song plays, a before / after report | labsmooth54, lab240edit, inputlatency (Lab slider → frame) |
| smooth-labframes | round 8's footage playing / stepping / scrubbing report | labframes (frame-exact stepping), labscrub (scrub cost per move) |
| sequence-smooth | the sequence playing and scrubbed, a painted-area report with no budget of its own | seqsolid (playing through cuts, scrubbing, swaps), labscrub |
| seqguard-swap | round 13's frame-size swaps in the sequence | seqsolid (round 29: swaps while playing, scrubbing, cuts; no black frames) |

Nothing was deleted as obsolete (class a): every feature the checks that ran name is still in the app.

## App bugs

**Fixed:**

1. **Ctrl/⌘+K: an archived project's chat showed no project.** Round 116 puts every chat in one project, but Find
   anything's "?words" rows only knew live projects: the store thread's `projectsOf()` (storework.js) skipped archived
   ones, and so did `Projects.projectOfChat()`, so the row said the AI's name ("Claude chat"). Now the store thread
   names an archived project too (a live project still wins when a chat is in both), and `chatfind.js` falls back to
   the archived project when the projects are loaded. The row reads **◆ Old archive (archived)**. Enter opens the chat
   as before. `projects.js` (Codex-owned) was not touched. `dev/search113-test.js` checks the mark (49/49), and
   `dev/store-thread-test.js` still passes (70/70).

**Written up (not fixed; not proven to be app bugs):** see "Open failures".

## Open failures by area (for their owners)

- **The Lab: labtype240 (?, failed twice the same way).** On the still type scene, round 58's settle test switches the
  tight type drawing on and counts the frames drawn until the Lab's pacing skips its first one. The budget is 24 frames
  (labtype58 brought it back to within 8). Both runs drew 48–60 frames at 1280×720 and at fit, with the gate long-moving
  (36–40). Every other step passes, and labpace / labplay55 pass. It could be load (both runs were on the shared box at
  load ≈ 2) or a pacing regression since round 58. Not resolved; it needs a run on a quiet box first.
- **lightweight (?, failed twice the same way).** Three budgets are just over, with the same numbers both times:
  observers 20 → 41 after the first session (budget +19), but no growth from the second session to the third (41 → 41,
  the check's own leak signal). The extra observers are chat-rest.js' ResizeObserver / IntersectionObserver (3 each),
  jank.js and astra.js. 414 detached nodes of closed ⋯ AI setup sheets (budget 400; +57 per session in the per-session
  figures). 4 → 6 processes (budget +1), the new one being Chromium's Audio Service after the Lab. These look like
  budgets that the app outgrew (round 116's project list, the Lab's audio), but the ⋯ AI setup sheets' +57 per session
  might be a small real leak. The budgets were left as they are. (astra.js is Codex-owned; the rest is not.)
- **progress-comp (?, failed twice the same way).** A /dispatch's two parts both work and finish, the comp card and the
  rail list show their bars, but the parts' own chat rows have no `.pg-bar`: the check looks for
  `#chat-groups .item[data-key=<part chat>]`. The part chats are most likely not in the open project's list (round 123's
  pattern 2), so the row isn't there. Either the parts should join the director chat's project (an app change), or the
  check should only ask for the row when the list shows it. Left for the owner of the dispatch.
- **search113:** fixed (b + c), see "App bugs, fixed" and the table. It passes (73 s). The check's fixture
  (`/tmp/hearth-search113`) is only made when missing, so the check doesn't rely on a new fixture: it opens the project
  each chat is in.

## For the patch notes

In Ctrl/⌘+K, a chat of an archived project now says which project it belongs to, marked "(archived)", instead of no
project. Behind the scenes, another part of Hearth's app tests was checked one by one. A few still assumed chats outside
any project and now open a project first, as the owner does. Five old smoothness tests that newer ones already cover were
removed, so a full test run is shorter.

## For Codex

- **No Codex-owned file was edited.** The archived-project label is in `storework.js` (the store thread's
  `projectsOf`, marked `(round 127, checksweep127)`) and `chatfind.js`. `Projects.projectOfChat()` in `projects.js`
  still returns live projects only, and its other callers (chat-memory, chat-scenes, native, project-workspace) are
  unchanged. If Projects should know archived chats' projects too, a `Projects.projectOfChat(id, { archived: true })`
  would let chatfind drop its own fallback scan.
- A chat in an archived project is listed nowhere in the chats list (no open project shows it). That's how round 116
  works today, and Ctrl/⌘+K is the way back to it.

## Not swept

These app checks were not run in this round. The off-limits checks (missions, missions2, swarmlean, astra-manager) were
left for their owners and not run. The next sweep picks up here:

34 checks: `renderfast`, `renders`, `renders-seq`, `scroll240`, `seqsolid`, `sequence`, `sequence-mcp`, `sequence-render`, `sequence-songpcm`, `shadowready`, `shape-moodboard-mask`, `slowbutton67`, `smooth-nodes`, `speed`, `stems`, `streamrender`, `studio-recipes`, `tour-discover`, `trim-drive`, `trim-lazy`, `trim-refs`, `type`, `video-fill-mask`, `visual-feedback`, `visual-feedback-live`, `voice`, `winmac`, `winmac49`, `winperf78`, `workbench-sketch-ai`, `workbench-visual`, `workbenches`, `astra-collab`, `astra-ui`, and the off-limits `missions`, `missions2`, `swarmlean`, `astra-manager`.
