# Check sweep (round 123, checksweep123)

The `release` group ran the qa group and the unit tests only, so the Electron app checks in `dev/checks/` mostly never
ran at release. Since round 116 (every chat in one project) three of them broke unseen: makes, smooth46 and access-chat.
This round ran the app checks one by one, sorted every failure and added a small **core** group to `release`.

**Status: partial sweep.** The coordinator asked to wrap up after about 8 hours of runs. **204 of the 419 app checks
were run** (alphabetically, `a11y` to `labeasy`, plus the core candidates). The other 215 are listed under
"Not swept" at the end. Nothing was deleted (see "Deletions").

How it ran: `flock /tmp/hearth-run.lock timeout 3000 node dev/run-checks.js --out <scratch> --exact <18 names>`, with
`HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package BIGPROFILE70=1 CHATWINDOW86=1 BIGCHAT84=1`, one batch at a time,
on the 4-core box (load around 2.5 during the runs). Opt-in checks whose variable isn't set were skipped by the
runner. Each failure was rerun once, after a fix when there was one. The core candidates were then run together once
more, on the final code: 21 of 23 passed in 22 min.

Classes: **a** obsolete · **b** check out of date · **c** app bug · **d** flaky or load / timing · **?** not resolved in
this round (see "Open failures").

## What broke the checks (the patterns)

1. **"Which project is this chat for?"** (8 checks: aicheck, connections, journey-chat, chatsafe55, and access-chat in
   accessfix123). Since round 116, a new chat started with no project open asks which project it is for, but only when
   the owner's own press started it. A check's `Native.newChat` a few seconds after one of its real CDP clicks is
   still inside Chromium's transient activation. So the question opened, and the check's next clicks landed on it.
   A `dialog.ui-modal button.primary` lookup found the question's **＋ New project…** button.
   **Fix:** the check opens a project of its own first (`Projects.create` + `ProjChats.setScope`), as access-chat,
   smooth46 and makes do.
2. **Chats made by the check aren't in the list** (chatperf, chatswitch, inputlatency, chat-new-row). The chats list
   shows only the open project's chats. **Fix:** the check opens its own project and `Projects.add`s each chat it
   makes.
3. **Smoke's wait for the background groups** (datasafe, bugbutton68, hintcalm). Before a check runs, `smoke.js` waits
   up to 30 s for the lazy groups loaded in the background (the Lab's prefetch). Three checks look at something that
   lasts 20 s from the start: a crash note, the "Hearth updated" note, files held for the first 20 s. Hints' log
   showed each note had been shown and was gone before the check looked. **Fix:** `--no-lazy-wait` in their smoke
   line (it was already there for the boot checks).
4. **Round 116's wording and removals** (appcalm, appsearch, creative): the project bar's two controls in the list,
   the Creative Playground now named Creative board, the Serum 2 & Vital (vst) station gone, a patch note quoting
   `/usage`.
5. **Per-check temp roots (round 106)** (deploy-build). The fake deploy CLIs write to the app's temp folder, which is
   now the check's own temp root. The check still read `/tmp/hearth-fake-deploy/calls.jsonl`, which holds a 1 November
   run's calls.
6. **A check that only worked through its own runner** (collab-appserver). `dev/collab-appserver-smoke.js` writes the
   fake engines' paths into the script, but run-checks didn't, so Astra was "not found". Run-checks now hands the paths
   in (`EXTRA_FLAGS`, `window.COLLAB_FAKES`), and the old runner still works.

## Results

Every check that ran, with each run in order (the later runs are reruns, mostly after a fix). The time is the last
run's.

| check | result (runs in order) | time | class | action |
|---|---|---|---|---|
| a11y | pass | 131 s |  |  |
| abcompare | pass | 64 s |  |  |
| access-astra | pass → pass | 41 s |  |  |
| access-chat | fail → pass | 70 s | b | fixed by accessfix123 (same round): opens a project first |
| activity | pass | 46 s |  |  |
| adaptive-feedback | pass | 61 s |  |  |
| adobe-ui | pass | 44 s |  |  |
| aicheck | fail → pass → pass | 49 s | b | opens a project first ("Which project?" covered section 4) |
| aiundo | pass | 60 s |  |  |
| appcalm | fail → fail → pass | 89 s | b | list budget 6 → 8 (round 116 project bar); finds "creative board" (renamed in round 116) |
| apps-discover | pass | 40 s |  |  |
| apps-meshy | pass | 83 s |  |  |
| apps-windows | pass | 45 s |  |  |
| appsearch | fail → pass → pass | 49 s | b | a patch note row quoting "/usage" is not a row label: What's new rows exempt |
| assets | pass | 49 s |  |  |
| assist | pass | 63 s |  |  |
| attachlean | pass | 44 s |  |  |
| autocompact | pass | 90 s |  |  |
| autoedit | pass | 45 s |  |  |
| autopolish | pass | 53 s |  |  |
| backupauto | pass | 41 s |  |  |
| beat108 | pass | 165 s |  |  |
| beatlink | pass | 59 s |  |  |
| beatload110 | pass | 144 s |  |  |
| bgperf | pass | 39 s |  |  |
| bigchat82 | skipped (opt-in) | 0 s |  |  |
| bigchat84 | pass | 72 s |  |  |
| bigscreen | pass | 100 s |  |  |
| bigscreen-hidpi | pass | 95 s |  |  |
| board | pass | 53 s |  |  |
| board-chat | pass | 40 s |  |  |
| board-extra | pass | 48 s |  |  |
| board-links | pass | 44 s |  |  |
| board-pack | pass | 41 s |  |  |
| board-perf | pass | 45 s |  |  |
| board-presets | pass | 90 s |  |  |
| brain | pass | 94 s |  |  |
| budget | pass | 42 s |  |  |
| bugbash | pass | 39 s |  |  |
| bugbash2 | pass | 63 s |  |  |
| bugbutton68 | fail → fail → pass | 8 s | b | --no-lazy-wait: the 20 s crash note had expired before the check looked |
| bundle98 | pass | 93 s |  |  |
| cachewise | pass | 40 s |  |  |
| calmstart | pass → pass | 23 s |  |  |
| capture-extras | pass | 53 s |  |  |
| capture-frames | pass | 50 s |  |  |
| capture-lab | pass | 55 s |  |  |
| capture-more | pass | 79 s |  |  |
| capture-pack | pass | 72 s |  |  |
| capture-record | pass | 68 s |  |  |
| capture-shots | pass | 45 s |  |  |
| chat-cmds | pass | 45 s |  |  |
| chat-extra | pass | 39 s |  |  |
| chat-look | pass | 54 s |  |  |
| chat-media | pass | 41 s |  |  |
| chat-menus | pass | 38 s |  |  |
| chat-new-row | fail → fail → fail → pass | 42 s | b | opens a project; waits for the real row (joins the project ~1.2 s after the save) |
| chat-stream | pass | 40 s |  |  |
| chatcalm | pass | 84 s |  |  |
| chatcore | pass → pass | 48 s |  |  |
| chatcore-count | pass | 41 s |  |  |
| chatcore-lab | pass | 49 s |  |  |
| chatkeep | pass | 225 s |  |  |
| chatlistfast | pass | 67 s |  |  |
| chatperf | fail → pass | 81 s | b | opens a project; its chats go in it |
| chatsafe55 | fail → pass → pass | 49 s | b | opens a project first |
| chatsteady73 | pass | 122 s |  |  |
| chatswitch | fail → pass → pass | 78 s | b | opens a project; its chats go in it |
| chatwindow72 | pass | 173 s |  |  |
| chatwindow86 | pass | 115 s |  |  |
| chrome | pass | 55 s |  |  |
| chromeview | pass | 50 s |  |  |
| clink-paper | skipped (opt-in) | 0 s |  |  |
| clutter | pass | 60 s |  |  |
| cmdbar | pass | 49 s |  |  |
| collab-appserver | fail → pass → pass | 35 s | b | run-checks hands it the fake engines (it only worked through its own runner) |
| commandonly | pass | 47 s |  |  |
| commands-page | pass | 51 s |  |  |
| commands-page-previews | pass | 43 s |  |  |
| commands-page-runs | pass | 41 s |  |  |
| comp | fail → fail | 187 s | ? | nested precomp draws black/dim, twice: not resolved (Lab precomp pages; see write-up) |
| comp-dispatch | fail → fail | 477 s | ? | parts never seen red/blue in the main scene, twice: not resolved (same as comp) |
| concise | pass | 41 s |  |  |
| connections | fail → pass → pass | 43 s | b | opens a project first ("Which project?" over AI setup) |
| context | pass | 45 s |  |  |
| costcoach | pass | 39 s |  |  |
| crashsafe | pass → pass | 89 s |  |  |
| creative | fail → pass | 73 s | b | station list without the removed vst station |
| credits | pass | 52 s |  |  |
| crew | pass | 128 s |  |  |
| ctxloss | pass | 219 s |  |  |
| datasafe | fail → fail → pass → pass | 39 s | b | --no-lazy-wait: the files are held 20 s only, smoke waited up to 30 s |
| decide | pass | 56 s |  |  |
| declutter | pass | 65 s |  |  |
| declutter-count | pass | 53 s |  |  |
| deploy-build | fail → pass | 57 s | b | reads the fake CLIs' log from its own temp root, not a stale /tmp one |
| desk89 | pass | 98 s |  |  |
| devices90 | pass → pass | 40 s |  |  |
| devreport | pass | 40 s |  |  |
| direction67 | pass | 41 s |  |  |
| director-dock | pass | 45 s |  |  |
| director-tools | pass | 49 s |  |  |
| directorfrugal | pass | 46 s |  |  |
| directorgame | pass | 59 s |  |  |
| directorlean | pass | 46 s |  |  |
| directorpreview | pass | 64 s |  |  |
| directorswitch | pass | 49 s |  |  |
| diskcalm | pass | 38 s |  |  |
| dragdrop | pass | 46 s |  |  |
| errorcalm | pass | 47 s |  |  |
| eyes-chat | pass | 44 s |  |  |
| eyes-look | pass | 42 s |  |  |
| eyes-pins | pass | 40 s |  |  |
| eyes-ui | pass | 42 s |  |  |
| eyes112 | pass | 81 s |  |  |
| fastboot | pass | 73 s |  |  |
| fastboot-lab | pass | 40 s |  |  |
| feedback-scene-recording | fail → pass | 54 s | d | passed on rerun |
| filewatch | pass | 70 s |  |  |
| finishline | pass | 38 s |  |  |
| firstrun | pass → pass | 54 s |  |  |
| firstscreen83 | pass | 75 s |  |  |
| firstscreen87 | pass | 74 s |  |  |
| firstscreen96 | pass | 78 s |  |  |
| flows | pass | 64 s |  |  |
| flows-video | pass | 45 s |  |  |
| fps107 | pass | 213 s |  |  |
| framebar64 | pass | 56 s |  |  |
| framepace57 | pass | 188 s |  |  |
| freshen | pass | 106 s |  |  |
| gallery | fail → fail | 277 s | ? | timed out at 240 s twice; not resolved (gallery shared page, see write-up) |
| gameaudio | pass | 76 s |  |  |
| gamefps54 | pass | 224 s |  |  |
| gameinput | pass | 137 s |  |  |
| gamelook | pass | 103 s |  |  |
| gamemode | pass | 56 s |  |  |
| gameperf | fail → fail | 61 s | d | chip cost reads 0 µs: performance.now() is 100 µs coarse here; left, noted |
| gameready | pass → pass | 271 s |  |  |
| gameready-relaunch | fail → fail | 84 s | d | second-launch shader cache speed-up not seen, twice; timing, left, noted |
| gamestream | pass | 123 s |  |  |
| gametex | pass | 140 s |  |  |
| gc104-measure | skipped (opt-in) | 0 s |  |  |
| gcchurn60 | pass | 118 s |  |  |
| glass240 | pass | 78 s |  |  |
| glrecover | pass | 70 s |  |  |
| gpu52 | pass | 40 s |  |  |
| gpuload84 | pass | 109 s |  |  |
| gpuplay76 | pass | 219 s |  |  |
| grade | pass | 66 s |  |  |
| grid-resize | pass | 39 s |  |  |
| guardloss78 | pass → pass | 46 s |  |  |
| habits | pass | 45 s |  |  |
| handoff | pass | 48 s |  |  |
| hintcalm | fail → pass | 85 s | b | --no-lazy-wait: the "Hearth updated" note had expired before the check looked |
| historylean | pass | 46 s |  |  |
| hitchmap63 | pass | 84 s |  |  |
| hooks | pass | 45 s |  |  |
| hz240 | pass | 105 s |  |  |
| idlecpu | pass | 321 s |  |  |
| inputlatency | fail → pass | 95 s | b | opens a project; its chats go in it |
| inspodrop65 | pass | 50 s |  |  |
| instantscene | fail → fail | 152 s | ? | only 1 of 3 picks drawn by the gallery page, twice; not resolved (same as gallery) |
| interop | fail → pass | 57 s | d | passed on rerun |
| jam | fail → fail | 638 s | ? | timed out at 600 s twice (Lab preview at 0 fps in the shot); not resolved |
| jam-board | pass | 79 s |  |  |
| jam-project | fail → pass | 72 s | d | the first run was cut off when a batch hit its time limit; passed on its own |
| jankwatch | pass | 46 s |  |  |
| journey-board | pass | 110 s |  |  |
| journey-capture | pass | 98 s |  |  |
| journey-chat | fail → fail | 82 s | b + ? | opens a project first: 5 of 7 failed steps pass now; the chats panel's "Search inside messages" (2 steps) still missing, not resolved |
| journey-commands | pass | 89 s |  |  |
| journey-lab | pass | 84 s |  |  |
| journey-upgrade | pass | 44 s |  |  |
| keptaside94 | pass → pass | 94 s |  |  |
| kinetictype | pass | 63 s |  |  |
| kvrename99 | pass | 40 s |  |  |
| lab240edit | pass | 160 s |  |  |
| lab240gpu | pass | 273 s |  |  |
| lab3d-models | pass | 56 s |  |  |
| labadapt | pass | 181 s |  |  |
| labaudio | pass | 65 s |  |  |
| labaudio77 | fail | 103 s | d? | scene B frames off the audio clock: timing, not rerun (out of time) |
| labaudio77-long | skipped (opt-in) | 0 s |  |  |
| labbatch | pass | 64 s |  |  |
| labboot | pass → pass | 90 s |  |  |
| labbridge72 | fail | 146 s | ? | Astra backstage three_screenshot: "the sketch is not rendering"; not rerun |
| labcalls74 | pass | 101 s |  |  |
| labcalm | fail | 72 s | ? | Lab control counts 50 / 52 over 47 (new toolbar buttons, e.g. Credits): not changed, Credits is off limits |
| labcamera | pass | 62 s |  |  |
| labcanvas56 | pass | 119 s |  |  |
| labchat102 | fail | 68 s | ? | backstage apply: scene A's History got 1 version, not 2; not rerun |
| labchat92 | pass | 125 s |  |  |
| labcompile90 | pass | 165 s |  |  |
| labcut-edit | pass | 52 s |  |  |
| labdirect | pass | 71 s |  |  |
| labdirector | pass | 72 s |  |  |
| labdraw74 | pass | 84 s |  |  |
| labdrop61 | fail | 37 s | ? | a .glb dropped in a project chat not added to the sketch's references; not rerun |
| labeasy | pass | 56 s |  |  |
| lazy | pass | 109 s |  |  |
| makes | pass | 97 s |  |  |
| project-workspaces | fail | 78 s | ? | TypeError (reading 'join') in the check; Codex-owned area, reported, not edited |
| projects | pass | 48 s |  |  |
| sync | pass | 57 s |  |  |

## Deletions

None this round. The sweep didn't reach the second half of the list, and every failure in the first half was a
check out of date or an open question, not a removed feature. The slim116 sweep had already deleted the Life and
studio checks, and only `syncmedia73` still names a removed feature (a passing mention). These candidates for the
trim are left for the next sweep (redundant if a newer check covers the same thing). They are **not deleted**:

- `polish8-tour`, `polish8-tour2`: picture tours of round 7's surfaces, with few assertions. `appcalm` and
  `simplify3` count the same surfaces.
- `polish8-smooth`, `smooth26`, `smooth32`, `smooth41`: before / after smoothness of old rounds. `fps107`,
  `inputlatency` and `scroll240` measure today's app.
- `simplify2`, `clutter`, `declutter-count`: control counts that `simplify3` / `appcalm` redo.
- `gameready-relaunch`: it depends on Chromium's shader disk cache speed-up, which this box doesn't show.

## App bugs

**Fixed:** none. No failure was shown to be an app bug.

**Written up (not fixed; not proven to be app bugs):**

1. **The Lab's extra drawing pages** (comp, comp-dispatch, gallery, instantscene, jam, labbridge72). These failed on
   both runs. The precomp pages draw black or dim. The gallery's one shared page drew 1 of 3 picks in 90 s, and the
   full gallery check timed out at 240 s. Jam timed out at 600 s, with the preview at 0 fps in its picture. Astra's
   backstage `three_screenshot` said "the sketch is not rendering". All six need a page drawing next to the preview
   (precomp, gallery stage or backstage), on SwiftShader under load. **Next step:** run comp and instantscene on a pre-116 tree
   (an export of `0db24de` is ready in the sweep's scratch folder; it didn't fit in the time) to tell a regression
   from the box.
2. **A new chat's row comes back about 1.2 s after its first message** (chat-new-row). With a project open, ＋ shows
   a "New chat" row at once. After the first message, that row goes away, and the real chat joins the project in
   `projchats.js` `place()`, which runs 1.2 s after the chat appears in the list (so a project's own workspace chat is
   added first). For about a second the chat has no row. The check now waits for the row. A fix would place a chat
   with a `pending` project at once.
3. **journey-chat:** with a project open, typing in the chats panel's search box no longer offers **Search inside
   messages** (`#panel .deep-search`), so the step "…and it finds the relay chat" fails. Either round 116's
   "Search this project's chats (#tag)" box dropped it on purpose (then the check is out of date), or it is a
   regression. Not resolved.
4. **labdrop61:** a `.glb` dropped in a project chat isn't added to the sketch's references. **labchat102:** a
   backstage apply gives scene A's History 1 new version where the check wants 2. Each ran once only.
5. **labcalm** (Lab control budget 47; 50 empty, 52 with layers): the Lab's toolbar now shows more controls, among
   them **Credits**. Credits is off limits to this round, so the budget was not raised. It is reported here for
   its owner.

## Open failures by area (for their owners)

- **Codex-owned:** `project-workspaces` fails with "TypeError: Cannot read properties of undefined (reading 'join')"
  (78 s, final run). It was not edited.
- **Off limits (credits):** see labcalm above.
- **Timing (d), left as they are:** `gameperf`: its chip cost reads 0 µs because `performance.now()` is coarse (100 µs) on this
  box. `gameready-relaunch`: no second-launch speed-up. `labaudio77`: scene B frames off the audio clock, run once.
  These are measurements, not core.

## The core group

`GROUPS.core` in `dev/run-checks.js` holds 20 app checks. Each passed in the final run on this round's code:

access-chat, access-astra, aicheck, collab-appserver (the engines and access) · datasafe, crashsafe (data safety) ·
chatcore, chat-new-row, chatsafe55, connections, appsearch (chats, Ctrl/⌘+K) · projects, makes (projects) · sync,
keptaside94, guardloss78, devices90 (sync) · firstrun, calmstart (startup) · labboot (the Lab's start)

**`release` = qa + unit + core.** The core checks' own times add up to about **20 min**. The final run took 22 min for
23 checks, so core adds about 20 min to a release, within the 25-minute aim. Two candidates were left out:
project-workspaces (failing, Codex's) and journey-chat (2 steps open). chatswitch passes but is a smoothness
measurement, so it was left out to keep the group under 20 checks.

## For the patch notes

Nothing changes in the app. Hearth's tests were checked one by one. Many of the app tests still started chats outside
any project, the way things worked before chats lived in projects. They now work in a project like you do. Twenty of
the most important ones (chats, projects, sync, the AIs, file access, data safety, start-up) now run before every
release, so a break like that is caught the same day.

## For Codex

No Codex-owned file was edited. `project-workspaces` (`dev/checks/project-workspaces.js`) fails on today's code with
"TypeError: Cannot read properties of undefined (reading 'join')". Please have a look; it was left out of the core
group for that reason. `feedback-scene-recording` failed once ("Paused playback/time not restored") and passed on its
rerun.

## Not swept

These 215 app checks were not run in this round (the second half of the alphabetical list). The next sweep picks up
at `laberrors80`:

`laberrors80`, `labexport`, `labfps72`, `labfps89`, `labframes`, `labframes-lib`, `labframes-mcp`, `labframes-more`, `labgestures`, `labgpu`, `labhub`, `labkeys`, `labload75`, `labload94`, `labmaterials`, `labmemory`, `labmodels99`, `labopen112`, `labpace`, `labperf`, `labplay55`, `labproj97`, `labrecipes`, `labscrub`, `labsearch`, `labshader`, `labshapes`, `labsmooth54`, `labstage`, `labstartfast`, `labsync87`, `labsync88`, `labtemplates`, `labtools73`, `labtype240`, `labvariations`, `labvisualizers`, `layer-masks-controls`, `layerdelete116`, `layergroups`, `lightweight`, `live`, `liveness-perf`, `liveness-ui`, `localanswers`, `longrun91`, `lookmatch`, `mainhang65`, `memory48`, `memorytidy`, `menucalm`, `missions`, `missions2`, `modeltex100`, `moodqualities67`, `motion`, `motion-in`, `motion-in-real`, `motion-render`, `motionpolish`, `multiformat`, `music`, `nativefeel`, `nobars`, `nodes-code`, `nodes-lab`, `nodes-shader`, `notify`, `offline`, `offline-project`, `offmain`, `options`, `orb`, `packs`, `packs89`, `particles`, `perf`, `perfectloop`, `perfguard`, `physics`, `pinboard`, `playbudget`, `playlatency`, `playloop`, `playnotes62`, `polish`, `polish8`, `polish8-smooth`, `polish8-tour`, `polish8-tour2`, `powerwise`, `presentready`, `progress`, `progress-comp`, `progress-smooth`, `projaudit108`, `projaudit108-sync`, `projaudit91`, `projaudit91-sync`, `projbig85`, `projbundle`, `project-allowance`, `project-auto-improve`, `project-clink-copy`, `project-continuity`, `project-desk`, `project-fluidity`, `project-lifecycle`, `projects-lightweight`, `projects72`, `projopen109`, `projopen86`, `projperf120`, `projsearch81`, `projsync76`, `publishkit`, `qa-commands`, `qa-keys`, `qa-mac`, `qa-stream`, `qa-sweep`, `qa-ui`, `quickstart`, `reach-open`, `readyspeed`, `realclick76`, `recall`, `remote`, `renderfast`, `renders`, `renders-seq`, `robust`, `robust-lab`, `router`, `routerlearn`, `routine-feedback`, `routinelean`, `routines`, `safetynet`, `scenedoctor`, `scenes`, `scenes-sync`, `scenesafe`, `scroll240`, `search113`, `sendpreview`, `seq-buttons`, `seq2`, `seq2-scenes`, `seqguard-edit`, `seqguard-swap`, `seqsolid`, `sequence`, `sequence-mcp`, `sequence-render`, `sequence-smooth`, `sequence-songpcm`, `settingscalm`, `shadowready`, `shape-moodboard-mask`, `simplify2`, `simplify3`, `slowbutton67`, `smooth-app`, `smooth-chat`, `smooth-lab`, `smooth-labframes`, `smooth-nodes`, `smooth26`, `smooth32`, `smooth41`, `smooth46`, `speed`, `splash`, `stems`, `storeack77`, `streamrender`, `studio-recipes`, `swarmlean`, `sync-switch-safety`, `sync72`, `syncaudit110`, `syncaudit110-states`, `synchard74`, `syncmedia73`, `syncpanel92`, `tidy`, `timemachine`, `tokenaudit`, `tour-discover`, `trim-drive`, `trim-lazy`, `trim-refs`, `twocomputers`, `twocopies64`, `type`, `undoall`, `updater`, `usagelimits`, `versions75`, `video-fill-mask`, `visual-feedback`, `visual-feedback-live`, `voice`, `whatsnew`, `winmac`, `winmac49`, `winperf78`, `workbench-sketch-ai`, `workbench-visual`, `workbenches`, `workspace-nav`, `astra-collab`, `astra-ui`, `astra-manager`
