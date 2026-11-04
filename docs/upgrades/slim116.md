# Round 116 · slim116: the Life tab and the music studio removed

Quentin redefined Hearth: **a chat wrapper for the AIs (Claude, Astra) in projects with cloud sync, plus a Three.js
editor the AIs fully control.** He chose to remove the code (not hide it) for two areas: the **Life tab** (quests, Paris,
outings, shows…) and the **music studio** (Sound desk, VST hosting, live set, park jam…). This round does that. It
deletes the modules and cuts every reference to them: menus, Ctrl+K lines, keys, rail buttons, IPC, preload bridges,
MCP ops, settings, help text and tests.

**User data is never touched.** Nothing in the data folder is deleted, moved or migrated. The quest journal, show
listings, tickets, leave reminders, Paris photos, music sessions, sound bank, `creative-vst/…`, `playback-volume.json`
and the other stores stay where they are. The sync engine still lists and syncs them unchanged (`sync-own.js`,
`sync-merge.js`, `sync-kinds.js` were not edited), so a Mac still on the older version loses nothing. This version of the
app just no longer reads or writes them.

## What was removed

**App files (164 files, 26,463 lines, about 2.5 MB):**

- **Life tab / quests:** `questguide*.js|css|html` (incl. `questguidemain.js`, `questguide-preload.js`, the guide window),
  `questhud*.js|css`, `weekquest*.js|css` + `weekquestmain.js`, `weekendplan*`, `rewards*`, `clickfirst*`, `trynew*`
  (+ `trynew71-core.js`), `tickets*` + `ticketsmain.js`, `ratp-core.js` + `ratpmain.js`, `eatnearby*`, `leavesoon*` +
  `leavesoonmain.js`, `beforego*`, `invite*`, `follow*`, `showsync*` + `showsyncmain.js`, `showprep*` + `showprepmain.js`,
  `outing-guide*` + `outing-guidemain.js`, `parisphotosmain.js`, and in `tools/`: every `quest-*` file (core, catalog,
  journal, paris, paris-ui, atlas, atlas-index, atlas-worker, shelf, project, chat, chat-core, review, proof, walk,
  walk-core, mapfirst), `outing-core.js`, `outing-desk.*`, `herepin*`, `errands*`, `parisjournal*`, `parisphotos*`,
  `liveset-quest.js`, `integrations/fl-studio/device_HearthQuest.py`. The biggest ones: `tools/quest-journal.js` (1,227
  lines), `questhud.js` (571), `tools/quest-core.js` (493), `tools/quest-paris.js` (451).
- **Music studio:** `creative-vstmain.js` and `creative-vst-*.py` (host, embed, liveset, midimap, offline, sketch,
  doctor: 3,358 lines of Python), `soundbankmain.js`, `audiodoctor*` + `audiodoctormain.js`, `bouncelogmain.js`,
  `dawsendmain.js`, `sketchpadsmain.js`, `refabmain.js`, `volumemain.js` + `volume-preload.js` (playback volume), and in
  `tools/`: `workbench-vst*.js|css` (the Sound desk), `preset-hover*`, `parkjam*`, `loopsong*`, `liveset*`,
  `bouncelog*`, `soundbank*`, `audiodoctor-desk.js`, `sketchpads*`, `refab*`, `midilearn*`, `dawsend*` (stems69),
  `studiohours*`.
- **Lazy groups gone (18):** questjournal, questcore, questhud, weekquest, weekendplan, leavesoon, eatnearby, beforego,
  tickets, follow, invite, trynew, studiohours, audiodoctor, sketchpads, refab, midilearn, dawsend. The `creative`
  group keeps only the Creative board.
- **Gone with them:** the **Life** rail button (`WorkspaceNav`), the `tool:quests` surface, the 🔊 playback volume
  button, the project bar's **Sound** tab, Projects › "Sound desk", a project Desk's "Instruments" block and quest card,
  the Serum 2 / Vital pickers (new project form and Project setup; a project's saved instrument list is kept as it was),
  "Paris Métro status key…" in Settings › Housekeeping (and its Find anything row), `/quests /quest /shows /paris
  /reward /sounds /liveset /sessions /hours /reference /daw /vst-preset /try`, `/jam park`, the Sound desk's `/song` and
  `/preset`, `/idea music: / quest:`, the quest tracker's Ctrl/⌘+Shift+O and the Live set / Arrange keys, 17 Ctrl+K
  lines, the "Check my audio setup" engine-doctor button, the chat tools' `chat_do sound` op (`chat_sound`), the main
  process's quest / show / leave / ticket / weather / photo / VST / sound bank / audio doctor / DAW / sketch IPC, the
  geolocation permission (only the quest tracker used it), Messages `sms:` links (only Invite used them), the leave /
  show reminders in `notify.js`, the 1-minute tours (patch notes "Try it", What's new rows, the start-up offer),
  Sidequest's one-time rail promotion in `tools.js`, and OpenStreetMap tile handling was left in `chromeguard.js` (see below).
- **Tests (152 files, about 16,500 lines):** every quest / Paris / outing / show / reminder / ticket / reward / tour
  test and check, every Sound desk / VST / live set / park jam / sound bank / loop song / MIDI learn / stems69 /
  bouncelog66 / sketchpads67 / refab68 / studio hours / preset hover / audio doctor / playback volume test and check,
  `dev/fake-ratp.js`, the fixtures `dev/fixtures/{fake-vst-py,showsync,soundbank,weekquest}`, `dev/map-session-test.js`,
  `dev/map-network-test.js`, and the measurement checks built on the quest journal (`longrun72`, `bigprofile70`,
  `uilag65`, `studioperf71`, `questperf65`, `map-board-flow`, `responsive-studio-map`, `project-map-worker`,
  `project-sound`, `newtour64`, `whatsnew71`, `clickfirst64`, `quickidea71`; the quick idea's unit test stays). In
  `dev/run-checks.js`: their UNIT lines, the three KNOWN_FAIL entries (all for removed files), `vst-live-test`'s
  opt-in, 40 groups that only held them, and the round-114 `extra` group with its `EXTRA_RX`. A release is the qa group
  plus every unit test again.

## What was kept (and why)

- **The Lab's audio, in full:** `tools/three-media.js`, `three-music*`, `three-audio*` (live sound input, `/audio`,
  the audio map), `three-stems*` (the Lab's own stems, round 30, not the studio's stems69), `three-beatlink*`, beat
  grid, song timeline, `three-sandbox.html`'s audio clock, `nowplaying.js` (Spotify), `interop-midi.js` (Lab MIDI out),
  `tools/three-stage-midi.js`, the Lab's own MIDI learn in `tools/three.js`, `jam.js` (Claude + Astra Lab jam),
  `offline-library.js` (the `hearth-three://` three.js library cache the Lab sandbox loads from; the round-114 list
  had put its test under "Life", but it is Lab code).
- **The Lab's ▶ Playtest rows** (playtest log, hitch map) used to come from `clickfirst.js`; they now live in
  `tools/three.js` (`playtestRows()`), with the same labels.
- **`/audio`** is the Lab's again (the Audio doctor held the name; `/hear` and `/audio-now` stay as aliases).
  **`/song`** and **`/preset`** are just the Lab's commands now.
- **The Creative board** (Shelf, Materials, Seamless tiles, Drawing, Storyboard: `tools/creative-*.js`,
  `tools/workbench-core.js`, `workbench-ui.js`, `workbench-story.js`) is not music: it stays, with its "Serum 2 &
  Vital" station and its ✦ Quest journal button removed. Its saved `vst` part is still validated and kept as saved.
- **⚑ Finish line's ✦ Polish this** still makes the three steps; only "Track it / Track + guide me" (a side quest)
  went. A scene's saved `quest` field is still read and kept.
- **💡 Quick idea** keeps 📁 Project (project notes) and 💬 Later. Ideas saved to 🎵 Music or ✦ Quest before are kept
  exactly as they are; their row says the place is gone and Move to… puts them in a project or Later.
- `chromeguard.js`'s OpenStreetMap tile header code is a few lines in a file owned by the Google sign-in work; it is
  now unused and left alone (its test, `map-session-test.js`, is deleted).
- `plugins/forgeheart/` (the HearthEmber / HearthPrism VST3 sources) and `.github/workflows/forgeheart-vst.yml` are
  not loaded by the app and carry the Forgeheart name, which is on the keep list. **They were left in place. Quentin should decide** whether they go too.

## Sizes

| | before | after |
|---|---|---|
| First screen (boot-test) | 64 scripts, **1,693 KB** of code (1,995 KB with notes) | 64 scripts, **1,678 KB** of code (1,979 KB with notes) |
| boot-test budget `jsKB` | 1,696 | 1,688 (1,678 + 10 headroom) |
| lazy-data.js (read before the first frame) | 112.4 KB | 103.3 KB |
| App JS, everything outside dev/ and docs/ | **18,731,848 bytes** | **16,594,459 bytes** (−2.14 MB, −11 %) |
| App JS + CSS + HTML + Python | 21,191,944 bytes | 18,661,957 bytes (−2.53 MB) |
| Lazy groups / files in them | 137 / 499 | 119 / 409 |
| Commands / Ctrl+K lines (whole app loaded) | | 943 / 1,379 |

Most of what was removed loaded lazily, so the first screen drops only 15 KB. That is the volume button and the Life button
in `renderer.js`, and the 18 groups' manifest lines. The memory and parse time of the removed groups are saved whenever
they would have loaded. Several of them (questhud, the quest tracker and its tours) loaded at every start.

## Tests run

- `node dev/boot-test.js`: 2,690 checks passed.
- `node dev/slim116-test.js` (new, in UNIT). A require-scan of every remaining file: `require()` (relative and
  `path.join(__dirname|ROOT, …)`), `path.join(__dirname, 'x.js|html|py')`, `new Worker('…')`, main.js's `lazyIpc`,
  index.html's scripts / stylesheets, lazy-data.js's files / css / after / META, run-checks.js's UNIT files and every
  name in its GROUPS. Then a leftover grep that fails on any removed file name, module global, lazy group, IPC channel,
  preload bridge, `tool:quests` or `chat_sound` outside docs/. A line that says slim116 is allowed. It was checked
  against a planted probe file and catches all six kinds.
- `node dev/lazy-manifest.js`: rewrote lazy-data.js / lazy-meta.js; the lazy build equals the old order (names 943,
  aliases 335, actions 1,379, keys 500, apps 51, tools 8, dups 0); no file threw.
- `HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock timeout 2400 node
  dev/run-checks.js --exact qa-commands qa-keys lazy fastboot unit:lazymanifest-test unit:slim116-test labload94
  unit:labaudio77-test`: see the result in the round's report.
- Run by hand while cutting: slowcard-test, storeack77-test, storeack-scan, datasafe-scan, creative-test,
  workbench-test, workbench-story-test, quickidea71-test, finishline-test, project-workspace-test, commandonly-scan,
  lazy-groups-test, plus a unit batch (appsearch, localanswers, whatsnew, notify, bugcard, deploy, voice, director-mcp,
  projects, credits, round67, promptdiet, toolslim, the scans, offline, offline-library, music, labaudio77).
- Not caused by this round: `dev/chatwin-scan.js` fails on `director-switch.js` (round 115 added it without an AUDIT
  line).

## For the patch notes

**Hearth is lighter.** Hearth is now what you use it for: chats with Claude and Astra in your projects, synced between
your computers, and the Three.js Lab the AIs can drive. The **Life tab** is gone: quests, the Paris map, outings, shows,
leave reminders, tickets, rewards, the week plan and the tours. The **music studio** is gone too: the Sound desk, the
Serum 2 / Vital instruments, the live set, park jam, the sound bank, arranging loops, MIDI learn, send to DAW, the audio
doctor and the playback volume button. **Your data is kept untouched**: nothing was deleted, moved or changed in your
data folder, and sync still carries those files, so a computer still on the older version keeps everything. The app
just doesn't open them any more. Everything the Lab uses for music visuals stays: songs, the beat grid, live sound
input, Spotify, analysis and the Lab's own sound. `/audio` is the Lab's "what it hears" again. Quick ideas go to a
project's notes or Later. Hearth carries about 2.5 MB less code, and two parts that used to load at every start no
longer do.

## For Codex

Deleted at the owner's request (his decision): every `tools/quest-*` file, `creative-vstmain.js` and `creative-vst-*.py`,
`tools/workbench-vst*.js|css`, `volumemain.js` / `volume-preload.js`, `outing-guide*`, `questguide*`, and their tests
(quest-*-test, questguide-*-test, vst-*-test, playback-volume-*, map-session-test, map-network-test, outing-*-test,
showsync-syndicated / -venues tests, checks quest-*, workbench-vst, vst-live, guided-quests, project-sound,
project-map-worker…).

Minimal reference cuts in the remaining Codex files, each marked `// (round 116, slim116)`:

- `project-workspace.js` (also edited by projchats116): no "Restoring your instrument…" stage
  (`WorkbenchUI.preloadSound` is gone, `warning` is null); the project bar's Sound tab; the new-project form's
  Serum 2 / Vital checkboxes (new projects get `plugins: []`); Project setup's Serum / Vital fields. A save keeps the
  project's stored `plugins` as it was. Left as is: `'sound'` in return points / `go('sound')` (it lands on the Creative
  board) and `plugins` in the compose hook's project line. Drop them when convenient.
- `projects-home.js`: the "Sound desk" menu item, the Instruments block and the `QuestGuide.projectCard` slot.
- `tools/workbench-ui.js`: no `WorkbenchVST` (setProject no longer writes `state.vst.projectPlugins`, no `vst`
  station, no `bank` / `soundTool` / `preloadSound` / `startSketch`, no `chat_sound` HubBridge handler). `state.vst` is
  still validated by `workbench-core.js` and saved as it was.
- `astra.js`: the `/preset` (Serum 2 / Vital) registration at its end.
- `engines.js`: `options.questReview` dropped from the evidence-review guard (`visualReview` unchanged).
- `offline.js`: the "open your DAW and Serum 2 / Vital once" hint in Take offline.
- `tools/creative-core.js` / `tools/creative-playground.js` (not on the Codex list, but Codex's style): the `vst` feature
  and the ✦ Quest journal button.
- Not edited: `sync-engine.js`, `cloud-files.js`, `engine-watch.js`, `sync-own.js`, `sync-merge.js`, `sync-kinds.js`.
  The removed areas' stores still sync unchanged.

Other owners' files with minimal cuts:

- `credits.js`: `hookDesk` is a no-op (the Sound desk's params events are gone); `credits-core.js` untouched.
- `tools/three-finish*.js` (the creative-direction session's): Track it / Track + guide me and the quest helpers
  removed; Polish this stays.
- three-direction*, collab-eyes.js, Swarm, manager and missions: not touched.
