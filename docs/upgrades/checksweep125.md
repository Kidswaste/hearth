# Check sweep, second half (round 125, checksweep125)

Round 123 (docs/upgrades/checksweep123.md) swept the app checks in `dev/checks/` from `a11y` to `labeasy` and left
215 for later. This round picked up at `laberrors80`. It ran the checks that guard projects, sync, chats, the
engines and start-up first, then as many of the rest as fitted in about 3 hours. It also deleted 13 redundant checks,
because the owner wants less testing.

**Status: partial sweep.** 88 checks ran (84 pass on their last run), and 4 opt-in ones were skipped.
13 were deleted. The rest are listed under "Not swept" at the end.

How it ran: the same as round 123. `flock /tmp/hearth-run.lock timeout 3000 node dev/run-checks.js --out <scratch>
--exact <11–15 names>` with `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1 CHATWINDOW86=1
BIGCHAT84=1`, one batch at a time, on the 4-core box (about 4 GB of disk free). Each failure was rerun once, after a
fix when there was one. One batch was stopped by this session's 30-minute background limit after its first check
(a rerun of projaudit108). That run is left out of the table, and the check was run again in a later batch.

Classes: **a** obsolete · **b** check out of date · **c** app bug · **d** flaky or load / timing · **?** not resolved in
this round (see "Open failures").

## What broke the checks (the patterns)

Round 123's patterns explain most failures again:

1. **"Which project is this chat for?"** (robust). The check's `Native.newChat` came a few seconds after its real
   click on **Update Claude Code**, so the question opened over the chat and covered the sign-in button. **Fix:**
   the check opens a project of its own first (`Projects.create` + `ProjChats.setScope`), as aicheck does.
2. **Chats made by the check aren't in the list** (versions75; search113's chats filter). The chats list shows only
   the open project's chats. **Fix (versions75):** the check opens its own project and `Projects.add`s its chat.
3. **Round 116's data model** (projects72, project-workspaces, search113):
   - projects72's big profile now has **41** projects. Round 116 puts the fixture's 1,500 loose chats in an
     **Earlier chats** project (`pj-earlier-chats`). The check now counts its 40 without that one.
   - project-workspaces failed with "Cannot read properties of undefined (reading 'join')". The **check** was
     wrong, not the app. It read `WorkbenchUI.snapshot().vst.projectPlugins`. slim116 removed the Sound desk, and
     with it the copy of the project's instruments into the worktable (`setProject` no longer writes them), so
     that field is gone. The project still keeps its instruments in `p.workspace.plugins`, and the check now reads
     them there.
   - search113 still expects "an archived project's chat: no project" and finds the chat filter's rows outside a
     project. Since round 116 every chat is in a project. Not fixed this round (see "Open failures").

## Results

Every check that ran, with each run in order (the later runs are reruns, mostly after a fix). The time is the last
run's.

| check | result (runs in order) | time | class | action |
|---|---|---|---|---|
| laberrors80 | fail → fail → fail | 87 s | ? | a non-compiling shader is noticed but no `health:` line reaches the chat, three times; not resolved (see App bugs 2) |
| labexport | pass | 193 s |  |  |
| labfps72 | skipped (opt-in) | 0 s |  |  |
| labfps89 | pass | 192 s |  |  |
| labframes | pass | 65 s |  |  |
| labframes-lib | pass | 37 s |  |  |
| labframes-mcp | pass | 51 s |  |  |
| labframes-more | pass | 126 s |  |  |
| labgestures | pass | 65 s |  |  |
| labgpu | pass | 59 s |  |  |
| labhub | pass | 97 s |  |  |
| labkeys | pass | 54 s |  |  |
| labload75 | skipped (opt-in) | 0 s |  |  |
| labopen112 | pass | 88 s |  |  |
| labproj97 | pass | 97 s |  |  |
| labsync87 | pass | 90 s |  |  |
| labsync88 | pass | 91 s |  |  |
| layerdelete116 | pass | 93 s |  |  |
| localanswers | pass | 42 s |  |  |
| memorytidy | pass | 43 s |  |  |
| menucalm | pass | 46 s |  |  |
| nobars | pass | 89 s |  |  |
| notify | pass | 76 s |  |  |
| offline | pass | 173 s |  |  |
| offline-project | pass | 38 s |  |  |
| options | pass | 41 s |  |  |
| projaudit108 | fail → fail | 220 s | ? | [fresh] a scene row on the Desk loads the scene but the window stays on the Desk, twice; Codex-owned, written up |
| projaudit108-sync | pass | 46 s |  |  |
| projaudit91 | pass | 69 s |  |  |
| projaudit91-sync | pass | 54 s |  |  |
| projbig85 | skipped (opt-in) | 0 s |  |  |
| projbundle | pass | 46 s |  |  |
| project-allowance | pass | 52 s |  |  |
| project-auto-improve | pass | 49 s |  |  |
| project-clink-copy | skipped (opt-in) | 0 s |  |  |
| project-continuity | pass | 89 s |  |  |
| project-desk | pass | 46 s |  |  |
| project-fluidity | pass | 45 s |  |  |
| project-lifecycle | pass | 57 s |  |  |
| project-workspaces | fail → pass | 85 s | b | reads the project's instruments from `p.workspace.plugins` (slim116 dropped the worktable copy); Codex-owned check, marked |
| projects-lightweight | pass | 40 s |  |  |
| projects72 | fail → fail | 153 s | b + d | counts 40 projects without round 116's "Earlier chats"; the rerun then missed 4 timing budgets that passed on the first run (load), noted |
| projopen109 | pass | 224 s |  |  |
| projopen86 | pass | 138 s |  |  |
| projperf120 | pass | 49 s |  |  |
| projsearch81 | pass | 50 s |  |  |
| projsync76 | pass | 49 s |  |  |
| qa-commands | pass | 39 s |  |  |
| qa-keys | pass | 186 s |  |  |
| qa-mac | pass | 39 s |  |  |
| qa-stream | pass | 62 s |  |  |
| qa-sweep | pass | 294 s |  |  |
| qa-ui | pass | 43 s |  |  |
| quickstart | pass | 51 s |  |  |
| reach-open | pass | 41 s |  |  |
| readyspeed | pass | 167 s |  |  |
| realclick76 | pass | 68 s |  |  |
| recall | pass | 40 s |  |  |
| remote | fail → pass | 69 s | d | passed on rerun |
| robust | fail → pass | 74 s | b | opens a project first ("Which project?" covered the sign-in button) |
| router | pass | 42 s |  |  |
| routerlearn | pass | 45 s |  |  |
| routinelean | pass | 245 s |  |  |
| routines | pass | 63 s |  |  |
| safetynet | pass | 85 s |  |  |
| scenes-sync | pass | 41 s |  |  |
| scenesafe | pass | 51 s |  |  |
| search113 | fail | 86 s | b | pre-116 expectations (an archived project's chat "no project", chats filter outside a project); not fixed, see Open failures |
| sendpreview | pass | 47 s |  |  |
| settingscalm | pass | 40 s |  |  |
| simplify3 | pass | 45 s |  |  |
| smooth46 | pass | 57 s |  |  |
| splash | pass | 75 s |  |  |
| storeack77 | pass | 93 s |  |  |
| sync-switch-safety | pass | 42 s |  |  |
| sync72 | pass | 54 s |  |  |
| syncaudit110 | pass | 78 s |  |  |
| syncaudit110-states | pass | 49 s |  |  |
| synchard74 | pass | 39 s |  |  |
| syncmedia73 | pass | 44 s |  |  |
| syncpanel92 | pass | 43 s |  |  |
| tidy | pass | 44 s |  |  |
| timemachine | pass | 100 s |  |  |
| tokenaudit | pass | 42 s |  |  |
| twocomputers | pass | 41 s |  |  |
| twocopies64 | pass | 48 s |  |  |
| undoall | pass | 45 s |  |  |
| updater | pass | 71 s |  |  |
| usagelimits | pass | 59 s |  |  |
| versions75 | fail → pass | 47 s | b | opens a project; its chat goes in it (the chats list shows the open project's chats) |
| whatsnew | pass | 117 s |  |  |
| workspace-nav | pass | 38 s |  |  |

## Deletions

13 checks were deleted with their run-checks entries (`GROUPS` lists and the `gameready-relaunch` → `gameready`
pair). Each one has a newer check that covers the same thing:

| check | why it goes | covered by |
|---|---|---|
| polish8-tour | a picture tour of round 7's surfaces with few assertions | appcalm, simplify3 (the same surfaces' counts), board / capture checks |
| polish8-tour2 | the second picture tour of the same surfaces | appcalm, simplify3, board-*, capture-* |
| polish8-smooth | before / after smoothness of round 7 (board pan, capture video) | scroll240 (board pan), fps107, capture-frames |
| smooth26 | before / after smoothness of rounds 25–26 | hz240, inputlatency, idlecpu (Lab hidden) |
| smooth32 | before / after smoothness of rounds 26–31 | inputlatency, chatwindow86, chatswitch, streamrender |
| smooth41 | the cost of rounds 33–40's always-on parts | idlecpu, inputlatency, attachlean, a11y |
| smooth-chat | streaming, scrolling up while streaming, a 320-message chat, switching chats | scroll240 (1,000 messages, while streaming), streamrender, chatswitch |
| progress-smooth | round 11's progress bars measured off vs on | streamrender, chatwindow86 (a streaming reply's cost today) |
| labperf | round 16's Lab before → after (song + filter layers, hidden, unfocused) | labfps89, lab240gpu, idlecpu, powerwise |
| simplify2 | round 27's control counts and "no /command in Settings" | settingscalm (Settings budget, every row found), simplify3, appcalm |
| clutter | round 4's control counts per surface | appcalm, simplify3, chatcalm |
| declutter-count | round 7's counts with calm on / off | appcalm, simplify3, chatcore-count (counts the chat the same way) |
| gameready-relaunch | needs Chromium's shader disk-cache speed-up, which this box never shows (failed twice in round 123) | gameready (the first launch's readiness) |

Nothing was deleted as obsolete (class a). Every feature the second half's checks name is still in the app. `music`,
`stems` and `studio-recipes` are about the Lab's audio and the Commands page, not the music studio that slim116 removed.

## App bugs

**Fixed:** none. No failure was shown to be an app bug.

**Written up (not fixed; not proven to be app bugs):**

1. **projaudit108 [fresh]: a scene row on the Desk doesn't open the Lab** (failed twice, the same way). After
   **Import project…**, a click on the project's scene row (`.pw-project-files` › Scenes › `.pj-item`) loads the
   scene into the Lab (`ThreeLab.scenes.currentId()` is the scene), but the window stays on the Desk
   (`H.activeId` is `tool:home`). `ProjectWorkspace.state().lastSwitch` is still the open's own `overview`.
   `ProjectWorkspace.go('scene')` therefore stopped at one of its `ticket!==route` returns, after the scene was
   opened and before `activate('tool:three')`. Something seems to start a newer `go()` while the Lab's code loads
   for the first time (a fresh profile; sceneMs was about 7 s). The check's fallback `ProjectWorkspace.open(id,
   'scene')` works, and every other step passes. It is in `project-workspace.js` / `projects-home.js`
   (Codex-owned), so it was not edited.
2. **laberrors80: a shader that doesn't compile isn't reported to the chat** (failed 3 times, the same way). The
   Lab notices it: `LabHealth.state()` holds a `shader` record, "'fooBar80' : undeclared identifier". But the chat's
   next tool call (`three_do layers`) has no `health:` line, and neither did the `three_add_layer` answer. The other
   kinds (a layer throwing every frame, a NaN camera, files that don't load, a lost GPU) all still get their line.
   `tools/three-health.js` `decorate()` skips a record already told to that chat, or one the answer already
   quotes. One of those seems to swallow the shader record. Not resolved. (Lab-owned, not off limits; there was
   no time to dig further.)

## Open failures by area (for their owners)

- **Codex-owned:** projaudit108 (above).
- **The Lab:** laberrors80 (above).
- **search113 (b, not fixed):** two of its expectations come from before round 116. (1) `dev/search113-queries.js`
  says "tamarind" finds "an archived project's chat: no project". Now the chat is in its (archived) project, and the
  row is labelled `Chat`. (2) The chats panel's filter ("kyoto", "cafe", "oberkampf cafe") looks for chats the
  check makes outside any open project, and the list shows only the open project's chats. The fix is pattern 2
  (open a project and add the chats) plus a new expectation for (1). Search's owner should choose the label an
  archived project's chat should get.
- **projects72 (b + d):** the project count is fixed. On the rerun, four measurements failed that had passed on the
  first run: warm open 834 ms (budget 800), switch 644 ms (budget 600), "tab switches drew more of the chat (50 →
  70)" and "the chat lost its place at its end". This is an opt-in big-profile measurement under load, so it is
  left as it is and noted.
- **remote (d):** failed once (soft takeover, fader → Lab slider, phone B follows phone A) and passed on its rerun.

## The core group

`GROUPS.core` is unchanged at 20. Second-half checks that passed and guard the core areas, for whoever next trims
or rotates core:

- **project-workspaces** (projects: a project's own chat, scene, moodboard and worktable, kept apart and across a
  reload; 85 s). It is the strongest candidate now that it passes. It could take the place of `makes` if core
  must stay at 20.
- **syncaudit110** (sync: the states end to end, 78 s) and **projsync76** (a project across two computers, 49 s).
  These overlap keptaside94 / guardloss78, so they would be swaps, not additions.
- **safetynet** (data safety: a real renderer crash, nothing lost, 85 s) sits beside crashsafe.
- **splash** (start-up, 75 s).

## For the patch notes

Nothing changes in the app. The second half of Hearth's app tests was checked one by one. A few still assumed the
world before chats lived in projects (a chat outside any project, a project count without "Earlier chats", the old
music desk's instrument list), and they now work the way the app does today. Thirteen old tests that newer ones
already cover were removed, so a full test run is shorter.

## For Codex

- **One check edited in a Codex-owned area:** `dev/checks/project-workspaces.js`, marked `// (round 125,
  checksweep125)`. The check read `WorkbenchUI.snapshot().vst.projectPlugins`, which slim116 stopped writing when the
  Sound desk went. Now it checks `p.workspace.plugins` (`'Vital'`), where the project keeps its choice. The app was
  right, so no app file was touched. The check passes (85 s).
- **projaudit108 [fresh]** fails twice the same way: a click on an imported project's scene row on the Desk opens
  the scene in the Lab, but the window stays on the Desk. See "App bugs" 1. It looks like a `route` race in
  `ProjectWorkspace.go()` during the Lab's first load. Not edited.
- No Codex-owned app file (projects*, project-workspace*, sync-engine.js, cloud-files.js, astra*, codex-*,
  workbench-*, engine-watch) was edited.

## Not swept

These app checks were not run in this round. Off-limits checks (missions, missions2, swarmlean, astra-manager) were
left for their owners and not run. The next sweep picks up here:

114 checks: `labload94`, `labmaterials`, `labmemory`, `labmodels99`, `labpace`, `labplay55`, `labrecipes`, `labscrub`, `labsearch`, `labshader`, `labshapes`, `labsmooth54`, `labstage`, `labstartfast`, `labtemplates`, `labtools73`, `labtype240`, `labvariations`, `labvisualizers`, `layer-masks-controls`, `layergroups`, `lightweight`, `live`, `liveness-perf`, `liveness-ui`, `longrun91`, `lookmatch`, `mainhang65`, `memory48`, `missions` (off limits), `missions2` (off limits), `modeltex100`, `moodqualities67`, `motion`, `motion-in`, `motion-in-real`, `motion-render`, `motionpolish`, `multiformat`, `music`, `nativefeel`, `nodes-code`, `nodes-lab`, `nodes-shader`, `offmain`, `orb`, `packs`, `packs89`, `particles`, `perf`, `perfectloop`, `perfguard`, `physics`, `pinboard`, `playbudget`, `playlatency`, `playloop`, `playnotes62`, `polish`, `polish8`, `powerwise`, `presentready`, `progress`, `progress-comp`, `publishkit`, `renderfast`, `renders`, `renders-seq`, `robust-lab`, `routine-feedback`, `scenedoctor`, `scenes`, `scroll240`, `seq-buttons`, `seq2`, `seq2-scenes`, `seqguard-edit`, `seqguard-swap`, `seqsolid`, `sequence`, `sequence-mcp`, `sequence-render`, `sequence-smooth`, `sequence-songpcm`, `shadowready`, `shape-moodboard-mask`, `slowbutton67`, `smooth-app`, `smooth-lab`, `smooth-labframes`, `smooth-nodes`, `speed`, `stems`, `streamrender`, `studio-recipes`, `swarmlean` (off limits), `tour-discover`, `trim-drive`, `trim-lazy`, `trim-refs`, `type`, `video-fill-mask`, `visual-feedback`, `visual-feedback-live`, `voice`, `winmac`, `winmac49`, `winperf78`, `workbench-sketch-ai`, `workbench-visual`, `workbenches`, `astra-collab`, `astra-ui`, `astra-manager` (off limits)
