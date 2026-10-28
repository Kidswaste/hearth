# checkhealth74: every check, red ones sorted out

Stream checkhealth74 (round 74). The whole suite (`node dev/run-checks.js --names all`: 434 app checks + 204 Node
tests) was run on a clean copy of main 660fb71 — app checks 5 per `flock /tmp/hearth-run.lock` hold, game checks with
HEARTH_THREE_DIR. The machine was shared with four other streams, so the full baseline took ~6 h and a container
restart stopped it after 380 of the 434 app checks; the last 54 (smooth-nodes … workspace-nav, astra-collab / ui /
manager) were then run once on this branch after merging main (round 75), all green except streamrender and smooth26.
Every check I changed, and the app checks touching what I changed, were re-run on the merged branch under flock.

Each red check got one of: **F** a real app bug, fixed · **S** a stale check, updated to today's UI keeping what it
verifies · **E** environment / fixture (now local, or opt-in) · **L** left alone: another stream's lane, the
creative-direction session's files, or Codex / Life work the owner paused. Budgets were not loosened except where
measured (appcalm, lightweight: numbers in the rows).

The biggest single cause: Codex's **Projects / Life spaces** (Oct 19) moved the AIs off the rail into a bar above the
chat and keeps tools behind projects or rail shortcuts. 20+ checks still clicked `#agent-buttons .agent-btn[data-id=…]`.
New `dev/checks/rail-lib.js` (smoke.js adds it to any check that uses `RAIL.`) gives the button that opens an AI or a
tool today: the old rail button, else the agent bar / Projects bar, else a rail shortcut made the way the owner adds
one, else the rail's Chats.

## Every check, before and after

Red before or after, or changed (the rest are listed below the table):

| Check | Before (660fb71) | After (this branch, merged with main) | Why / what was done |
|---|---|---|---|
| adaptive-feedback | FAIL | FAIL | E: the runner never gave it its test video (now --fake-engines + FEEDBACK_FIXTURE like visual-feedback). Now runs further and stops at Codex's "Deep budget not shown before sending": L, for Codex |
| appcalm | FAIL | pass | S: the Projects / Life spaces moved the AIs to a bar above the chat (+3 controls on chat screens, measured 27/25/28/28/28/27; budgets set there, the rail still ≤ 12); Creative Playground is in the Projects bar, not the rail ⋯ |
| appsearch | FAIL | pass | S: Hearth starts on the Projects space; the check now opens a Claude chat before asking about "permissions" |
| assets | FAIL | pass | E: read the index 900 ms after a change on a loaded machine (saved at 600 ms + disk); now waits for the save itself |
| bugbutton68 | FAIL | pass | S: round 71 put 💡 Ideas between That was slow and Something broke |
| capture-extras | FAIL | pass | S: no ▦ rail button any more; the tape now records a real click on the rail's Projects |
| chatlistfast | FAIL | pass | S: the chats list is the chat space's; opens a chat first |
| chatswitch | FAIL | pass | S: no rail buttons for the Lab / Claude (spaces rail): the Lab via a rail shortcut, Claude via the agent bar / Chats (rail-lib). Recent chat scripts 8.3 ms on main → median 7.2 ms; budget 8 kept |
| clickfirst64 | FAIL | FAIL | S: Studio entry is the rail's Life, its tabs Today · Map · Progress, the Sound desk via the Projects bar. Still red: "✎ Note (F8)" clicked on the game's F chip makes no note (F8 key works: playnotes62 green) — L, needs a look at the chip's input in the game window |
| clink-paper | FAIL | not re-run | E: needs a copy of the owner's Clink scene; now opt-in (CLINK_FIXTURE) |
| declutter | FAIL | pass | S: ＋ Add agent is hidden for good on the spaces rail (Alt reveal shown with ⌕ instead), agents in the bar, the chats button is the chat space's, the stage pill covers the top of the picture (right-click its middle) |
| direction67 | FAIL | not re-run | L: the creative-direction session's ✦ Direction (busier / warmer don't move sliders); not touched |
| fastboot | FAIL | pass | F: reading the lazy ProjectWorkspace / ChatRest globals woke their groups while the first screen was drawn (tools.js, native.js); S: the Projects home is the first screen, its group counts as first-screen |
| gameready-relaunch | FAIL | not re-run | E: runs only right after gameready in the same run (PAIRS); my 5-per-hold batches split the pair — not a check problem |
| gcchurn60 | FAIL | not re-run | L: per-frame allocations in ▶ Play / the Lab preview over budget (labdraw74's lane); not re-run |
| journey-board | FAIL | pass | S: the board from a rail shortcut (rail-lib) |
| journey-lab | FAIL | pass | S: Codex's shape / mask row is an .fx-tabs too; F: ↶ refused the AI's code edit after you added a look or shuffled (round 73) |
| journey-upgrade | FAIL | pass | S: reads the chats list in the chat space |
| lab240edit | FAIL | not re-run | L: slider drag 7 storage writes vs 6 (Lab per-frame lane); not re-run |
| labadapt | FAIL | pass | S: "Lighten to stay smooth" is "Quality: auto" since labfps72 |
| labaudio | FAIL | pass | F: /audio was the Audio doctor only since round 64 — the Lab's "what it hears" (and /hear) was never registered |
| labboot | FAIL | pass | S: the Lab from a rail shortcut (rail-lib) |
| labcalm | FAIL | not re-run | L: the Lab toolbar grew to 14 (budget 11): Finish line, Direction, Credits — the creative-direction session's buttons; budget not loosened |
| labdrop61 | FAIL | not re-run | L: a .glb dropped in a project chat isn't added to the scene's references (Codex / projects); not touched |
| labgestures | FAIL | not re-run | L: still scene draws 3.2/s vs 2.5 (labpace; labdraw74's lane) |
| labkeys | FAIL | not re-run | E: passes alone (drag gestures under load); not changed |
| labpace | FAIL | not re-run | L: labdraw74's lane (still-scene draws) |
| labscrub | FAIL | not re-run | L: timeline pan 22.2 vs 20 ms/move under load (Lab per-frame lane) |
| labstartfast | FAIL | FAIL | S: the Lab from a rail shortcut (rail-lib, also on window for its replayed parts). Still red: on open the timeline grows 78 → 281 px right after the preview is laid out (one resize of every canvas) — L, Lab lane |
| lightweight | FAIL | pass | S: chat-rest.js (round 72) keeps one IntersectionObserver per chat list: 20 → 38 → 38 measured, flat per session; allowance from the start 16 → 19 |
| memory48 | FAIL | not re-run | L: Lab GL programs +9/h vs 8/h (Lab lane); not re-run |
| menucalm | FAIL | pass | S: AI / tool menus on the agent bar and a rail shortcut; Lighten → Quality: auto |
| offline-project | FAIL | pass | E: downloaded three.js from the network; now a "download" copies from the local package (HEARTH_THREE_DIR) and the project is made through Projects |
| options | FAIL | pass | S: AI setup is Settings › ⋯ AI setup on the spaces rail |
| paris-today | FAIL | not re-run | L: Codex's Life / Paris map ("11th pin rendered"); not touched (owner: no Life work) |
| pinboard | FAIL | pass | S: the Projects home's turned orbit art counted as a leftover |
| playnotes62 | FAIL | pass | E: first note at 0:11 on a loaded machine vs "0:0x" |
| progress | FAIL | pass | F: the progress bar on an AI's icon looked only in the rail; the icons live in the agent bar now |
| project-auto-improve | FAIL | not re-run | L: projdesk74 wires its flags (now on main) |
| project-clink-copy | FAIL | not re-run | E: needs a copy of the owner's Clink project; now opt-in (CLINK_FIXTURE) |
| project-sound | FAIL | not re-run | L: projdesk74 (--fake-vst, now on main) |
| projects-lightweight | FAIL | not re-run | L: projdesk74 (HEARTH_LOOPLAG, now on main) |
| qa-keys | FAIL | pass | S: 💡 Quick idea's Ctrl+Alt+I is a system-wide key the main side owns (skipped like Ctrl+Alt+H) |
| routine-feedback | FAIL | not re-run | L: Codex's auto-improve recording doesn't restore paused playback; projects lane, not touched |
| simplify2 | FAIL | pass | F: the keys sheet showed "/playtest key" (no /commands on screen rule) |
| smooth26 | not run | FAIL | S: rail buttons via rail-lib. Still red: the missions ◎ real click opens nothing in its segment (.click() works) — not resolved |
| streamrender | not run | FAIL | not run on main (ran only after the merge): jump to message #3 / find leave it out of view — L, chat lane, needs a look |
| tidy | not run | pass | F: the rail ⋯'s Ideas row had an emoji instead of the drawn icon set |
| usagelimits | not run | pass | S: the week's reset was a fixed "Oct 31" the calendar reached; now 7 days ahead, and a pace forecast at 84 % is accepted (never "too early") |
| unit:robust-engine-test | FAIL | pass | E: timing under load (passes alone) |
| unit:audio-test | FAIL | pass | E: timing under load (passes alone) |
| unit:winmac-test | pass | pass | after the merge: projbundle75's zip names split on / (reviewed) |
| unit:nativefeel-test | FAIL | pass | S/F: Quick idea's key is ⌃⌥I on a Mac (real Control) — WinMac.MAC_REAL_CTRL now says so |
| unit:winmac49-test | FAIL | pass | F: ⌘ texts: FL Studio guide said Ctrl+S on the Mac, the Lab layers box's label Ctrl+C / V |
| unit:chatsafe-scan | pass | pass | S: routines.js allow line out of date (Codex); after the merge also reviewed projbundle75 / versions75 lines (new ids / the chat keeps its AI) |

**Green before, untouched by this stream, not re-run (519):** a11y, abcompare, access-astra, access-chat, activity, adobe-ui, aicheck, aiundo, apps-discover, apps-meshy, apps-windows, assist, attachlean, autocompact, autoedit, autopolish, backupauto, beatlink, bgperf, bigscreen, bigscreen-hidpi, board, board-chat, board-extra, board-links, board-pack, board-perf, board-presets, bouncelog66, brain, budget, bugbash, bugbash2, cachewise, capture-frames, capture-lab, capture-more, capture-pack, capture-record, capture-shots, chat-cmds, chat-extra, chat-look, chat-media, chat-menus, chat-new-row, chat-stream, chatcalm, chatcore, chatcore-count, chatcore-lab, chatkeep, chatperf, chatsafe55, chatwindow72, chrome, chromeview, city-integration, clutter, cmdbar, commandonly, commands-page, commands-page-previews, commands-page-runs, comp, comp-dispatch, concise, connections, context, costcoach, crashsafe, creative, credits, crew, ctxloss, datasafe, decide, declutter-count, deploy-build, devreport, director-dock, directorfrugal, directorgame, directorlean, directorpreview, diskcalm, dragdrop, eatnearby71, errands67, errorcalm, eyes-chat, eyes-look, eyes-pins, eyes-ui, fastboot-lab, feedback-scene-recording, filewatch, finishline, firstrun, flows, flows-video, follow70, framebar64, framepace57, freshen, gallery, gameaudio, gamefps54, gameinput, gamelook, gamemode, gameperf, gameready, gamestream, gametex, glass240, glrecover, gpu52, grade, grid-resize, guided-quests, habits, handoff, herepin66, hintcalm, historylean, hitchmap63, hooks, hz240, idlecpu, inputlatency, inspodrop65, instantscene, interop, invite67, jam, jankwatch, journey-capture, journey-chat, journey-commands, kinetictype, lab240gpu, lab3d-models, labbatch, labbridge72, labcamera, labcanvas56, labcut-edit, labdirect, labdirector, labeasy, labexport, labframes, labframes-lib, labframes-mcp, labframes-more, labgpu, labhub, labmaterials, labmemory, labperf, labplay55, labrecipes, labsearch, labshader, labshapes, labsmooth54, labstage, labtemplates, labtype240, labvariations, labvisualizers, layer-masks-controls, layergroups, leavefix70, leavesoon68, live, liveness-perf, liveness-ui, liveset64, localanswers, lookmatch, loopsong63, mainhang65, makes, map-board-flow, mapbuttons66, mapbuttons66-old, mapfirst64, memorytidy, midilearn69, missions, missions2, moodqualities67, motion, motion-in, motion-in-real, motion-render, motionpolish, multiformat, music, nativefeel, newtour64, nobars, nodes-code, nodes-lab, nodes-shader, notify, offline, offmain, orb, outing-desk, packs, paris-discovery, paris-quiet-map, paris-social, parisjournal64, parkjam62, particles, perf, perfectloop, photos69, physics, playback-volume, playbudget, playlatency, playloop, polish, polish8, polish8-smooth, polish8-tour, polish8-tour2, powerwise, presentready, presethover61, progress-comp, progress-smooth, project-allowance, project-continuity, project-desk, project-fluidity, project-lifecycle, project-map-worker, project-workspaces, projects, publishkit, qa-commands, qa-mac, qa-stream, qa-sweep, qa-ui, quest-auto-proof, quest-chat-context, quest-deck, quest-field, quest-focus, quest-icons, quest-journal, quest-life, quest-map-tiles, quest-offer, quest-paris, quest-project, quest-project-context, quest-proof, quest-review-fair, quest-session, quest-shelf-native, quest-studio, quest-workstation, quest-world, questhud61, questperf65, questwalk63, quickstart, ratp69, reach-open, readyspeed, recall, refab68, remote, renderfast, renders, renders-seq, responsive-studio-map, rewards63, robust, robust-lab, router, routerlearn, routinelean, routines, safetynet, scenedoctor, scenes, scenes-sync, scenesafe, scroll240, sendpreview, seq-buttons, seq2, seq2-scenes, seqguard-edit, seqguard-swap, seqsolid, sequence, sequence-mcp, sequence-render, sequence-smooth, sequence-songpcm, settingscalm, shadowready, shape-moodboard-mask, shotgun-programmes, shotgun-syndicated, showprep62, showsync61, simplify3, sketchpads67, slowbutton67, smooth-app, smooth-chat, smooth-lab, smooth-labframes, unit:board-unit-test, unit:store-thread-test, unit:board-mcp-test, unit:capture-mcp-test, unit:director-mcp-test, unit:cut-test, unit:capture-test, unit:music-test, unit:code-flow-test, unit:importer-test, unit:director-cost, unit:astra-engine-test, unit:test-aemain-mac, unit:sequence-test, unit:flows-test, unit:sync-test, unit:cmdpage-test, unit:progress-test, unit:makes-test, unit:renders-test, unit:updater-test, unit:access-test, unit:adobe-test, unit:adobe-mcp-test, unit:deploy-test, unit:apps-unit-test, unit:eyes-test, unit:liveness-test, unit:devreport-test, unit:labexport-test, unit:voice-test, unit:projects-test, unit:timemachine-test, unit:remote-qr-test, unit:interop-test, unit:context-test, unit:assets-test, unit:type-test, unit:motion-in-test, unit:physics-test, unit:connections-test, unit:hooks-test, unit:autoedit-test, unit:publishkit-test, unit:router-test, unit:firstrun-test, unit:lookmatch-test, unit:aiundo-test, unit:packs-test, unit:safetynet-test, unit:instantscene-test, unit:chrome-test, unit:budget-test, unit:recall-test, unit:autopolish-test, unit:stems-test, unit:pinboard-test, unit:chromeview-test, unit:tokens-test, unit:cache-test, unit:quickstart-test, unit:perfectloop-test, unit:labadapt-test, unit:labvariations-test, unit:winpolish-test, unit:macpolish-test, unit:multiformat-test, unit:labpace-test, unit:scenedoctor-test, unit:autocompact-test, unit:offline-test, unit:labgestures-test, unit:concise-test, unit:twocomputers-test, unit:labtemplates-test, unit:streamrender-test, unit:tokenaudit-test, unit:labsearch-test, unit:updatesafe-test, unit:appsearch-test, unit:directorlean-test, unit:abcompare-test, unit:bigscreen-test, unit:memorytidy-test, unit:dragdrop-test, unit:beatlink-test, unit:hintcalm-test, unit:routerlearn-test, unit:labrecipes-test, unit:powerwise-test, unit:attachlean-test, unit:labcamera-test, unit:toolslim-test, unit:routines-test, unit:undoall-test, unit:renderfast-test, unit:whatsnew-test, unit:handoff-test, unit:filewatch-test, unit:labbatch-test, unit:scenesafe-test, unit:directorpreview-test, unit:datasafe-test, unit:costcoach-test, unit:glrecover-test, unit:localanswers-test, unit:notify-test, unit:backupauto-test, unit:sendpreview-test, unit:errorcalm-test, unit:kinetictype-test, unit:layergroups-test, unit:promptdiet-test, unit:platform46-test, unit:labkeys-test, unit:labdirect-test, unit:usagelimits-test, unit:directorfrugal-test, unit:historylean-test, unit:crashsafe-test, unit:diskcalm-test, unit:labmaterials-test, unit:labvisualizers-test, unit:commandonly-scan, unit:routinelean-test, unit:labshapes-test, unit:presentready-test, unit:gpu52-test, unit:chatkeep-test, unit:gameperf-test, unit:gamemode-test, unit:gameready-test, unit:directorgame-test, unit:gameinput-test, unit:gametex-test, unit:labchats54-test, unit:gamefps54-test, unit:playbudget-test, unit:configsafe-test, unit:shadowready-test, unit:playlatency-test, unit:readyspeed-test, unit:playnotes-test, unit:hitchmap-test, unit:bouncelog66-test, unit:errands67-test, unit:cloud-files-test, unit:sketchpads67-test, unit:refab68-test, unit:midilearn69-test, unit:stems69-test, unit:studiohours71-test, unit:quickidea71-test, unit:quest-test, unit:showsync-test, unit:showprep-test, unit:questhud-test, unit:quest-paris-test, unit:city-integration-test, unit:outing-test, unit:questwalk-test, unit:parisjournal64-test, unit:photos69-test, unit:rewards-test, unit:weekendplan-test, unit:weekquest-test, unit:trynew71-test, unit:trynew-test, unit:presethover61-test, unit:gamehooks55-test, unit:vst-live-host-test, unit:parkjam62-test, unit:soundbank63-test, unit:loopsong63-test, unit:syncmedia73-test, unit:chatsteady73-test, unit:sync72-test, unit:twocopies-test, unit:vstembed64-test, unit:audiodoctor64-test, unit:labfps72-test, unit:framebar-test, unit:liveset64-test, unit:inspodrop-test, unit:winfresh-test, unit:slowcard-test, unit:bugcard-test, unit:herepin66-test, unit:invite67-test, unit:leavesoon68-test, unit:ratp69-test, unit:tickets68-test, unit:follow70-test, unit:leavefix70-test, unit:eatnearby71-test

**Green before and re-run green after the merge (8):** audiodoctor64, director-tools, labtools73, lazy, quickidea71, unit:boot-test, unit:datasafe-scan, unit:errorcalm-scan

**Not reached on main before the restart, green on the merged branch (50):** smooth-nodes, smooth32, smooth41, smooth46, soundbank63, speed, splash, stems, stems69, studio-recipes, studiohours71, studioperf71, swarmlean, sync, sync-switch-safety, sync72, syncmedia73, tickets68, timemachine, tokenaudit, tour-discover, trim-drive, trim-lazy, trim-refs, twocomputers, twocopies64, type, uilag65, undoall, updater, video-fill-mask, visual-feedback, visual-feedback-live, voice, vst-live, vstembed64, weekendplan66, weekquest62, whatsnew, whatsnew71, winmac, winmac49, workbench-sketch-ai, workbench-visual, workbench-vst, workbenches, workspace-nav, astra-collab, astra-ui, astra-manager

**Opt-in, skipped both times (6):** bigprofile70, chatsteady73, labfps72, longrun72, projects72, quest-review-live; now also clink-paper and project-clink-copy (CLINK_FIXTURE).

## Fixes in the app (what the owner would have seen)

1. **Ctrl/⌘+Shift+R in the Lab reloaded all of Hearth.** The round-45 guard read `window.ThreeLab`, which never exists
   (ThreeLab is a script-level const), so the key reloaded the whole window instead of
   the toast. Same dead read fixed in publishkit.js (the video's song / scene / BPM never reached the post words).
   renderer.js, publishkit.js.
2. **/audio in the Lab opened the Audio doctor.** Since round 64 the doctor's /audio took the name and the Lab's "what
   it hears" (/audio, /audio names, /hear) was never registered. The Lab's is /hear now, and /audio hands "names" and a
   bare /audio with the Lab on screen to it; /audio doctor|quick|live|… is the doctor as before.
   tools/three-audio-cmds.js, audiodoctor.js.
3. **↶ (the director dock's undo) refused after you touched the scene.** Since round 73 ↶ undoes an AI's whole reply,
   but only if nothing changed since; adding a look or shuffling sliders made it refuse, and "Undo anyway" would have
   put the whole scene back over your later changes. Now it falls back to undoing the AI's own code edit when that
   layer is as the AI left it (as before round 73). tools/three-director.js (labcalls74's file: one small block).
4. **A reply's progress bar no longer showed on the AI's icon** (the icons moved to the agent bar). progress-ui.js.
5. **Mac wording:** 💡 Quick idea's key showed as ⌥⌘I (Developer tools) in key labels; it is ⌃⌥I. The FL Studio guide
   said "Press Ctrl+S" on the Mac (now ⌘S); the Lab layers box's spoken label said Ctrl+C / Ctrl+V. winmac.js,
   questguide-window.js (Codex), tools/three-layers.js.
6. **Start-up:** a background chat render and the Three Director lookup read two lazy globals while the first screen
   was drawn, asking for their groups early. native.js, tools.js.
7. **Offline project prep works from a local three.js copy** (HEARTH_THREE_DIR, as deploy / ▶ Play already did): only on
   a download, so a new computer still reports what it lacks. offline-library.js (Codex).
8. The keys sheet's playtest-note line said "/playtest key changes it" (the no-/commands-on-screen rule); the rail ⋯'s
   Ideas row now uses the drawn icon set like its neighbours. playnotes.js, lazy-meta.js, simplify.js.

## Left for others (still red, with where to look)

- **creative-direction session:** labcalm (Lab toolbar 14 vs 11: Finish line, Direction, Credits), direction67.
- **Lab per-frame (labdraw74 lane):** labpace / labgestures (still scene 3.2 draws/s), gcchurn60, lab240edit, labscrub,
  memory48 (GL programs +9/h); labstartfast's timeline growing 78 → 281 px right after the preview is laid out.
- **Codex / projects:** adaptive-feedback ("Deep budget not shown"), routine-feedback (paused playback not restored
  after a feedback recording), labdrop61 (.glb in a project chat not added to references), paris-today (Life).
- **chat lane:** streamrender — jump to message #3 / find leave the message out of view (seen only after the merge).
- **not resolved here:** clickfirst64's "✎ Note (F8)" click on the game's F chip makes no note (the F8 key works);
  smooth26's real click on ◎ opens nothing in its missions segment (a plain .click() does).
- **projdesk74** fixed project-auto-improve / project-sound / projects-lightweight flags on main (not re-run here).
- Flaky under load, passing alone: labkeys, unit:audio-test, unit:robust-engine-test; gameready-relaunch only runs
  after gameready in the same run.

## For Codex

Small, marked edits in your files (each has a "(round 74, checkhealth74)" comment):
- offline-library.js: `localDir` (HEARTH_THREE_DIR) as a download source; register passes it.
- questguide-window.js: `SAVE_KEY` (⌘S on a Mac) in the three FL Studio "save to check" lines.
- dev/checks/offline-project.js: the project made through Projects (Projects.flush replaced a kv-written list).
- dev/checks/clink-paper.js, project-clink-copy.js: `// opt-in: CLINK_FIXTURE` (they need your Clink copy).
- dev/run-checks.js: adaptive-feedback gets the feedback test video like visual-feedback.
- dev/chatsafe-scan.js ALLOW: routines.js (new spread order), projbundle.js (fresh chat ids), versions-core.js.
- Still red in your area: adaptive-feedback, routine-feedback, labdrop61, paris-today (see above).

## For the patch notes

- Ctrl/⌘+Shift+R no longer reloads all of Hearth while the Lab is open (it shows a note instead, as intended).
- /audio in the Lab tells you what the Lab hears again (and /audio names lists the sound features); /audio doctor
  still checks your music setup.
- ↶ in the director's dock undoes the AI's code edit even after you added a look or moved sliders, without wiping
  what you did since.
- An AI's progress bar shows on its icon above the chat again.
- On the Mac: Quick idea's key reads ⌃⌥I, and the FL Studio guide says ⌘S.
- Preparing a project for offline use can take the scene libraries from a local three.js copy.
