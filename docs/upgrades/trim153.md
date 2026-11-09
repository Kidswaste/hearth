# Trim Hearth (round 153b, trim153): switch off what you don't use

The owner: Hearth should focus on being "a chat wrapper for clients + a three js editor that it has full control over",
and: "remove features you don't use". We can't see his usage from here, so Hearth now shows him **its own local usage
numbers** per feature and lets him switch features off in one click. A switched-off feature **doesn't load at all**
(no code, no timers, no menu entries); it's fully reversible and never deletes data. Plus the code that was provably dead.

## 1. Inventory

Every lazy group (161, with the new `trim`) belongs to exactly one feature: **63 switchable** (4.3 MB of code) and
**10 always on** (core). The eager first screen (62 scripts, 1,546 KB of code) is chat + rail + registries: always on.

How the costs read: *KB* = the group's JS + CSS (`TrimData.KB`, `node dev/trim-weights.js`). *Loads*: `start` = loads
with Hearth (asap right after the first frame, or in the calm moment after the start), `on use` = only when used.
Always-on costs of a loaded group: the repeating timers it starts while loading are counted by lazy.js
(`Lazy.state()[].timers`) and shown in the panel; at rest the whole window has one repeating timer (lazy.js' own 2-minute
one) either way — the features' background work is timeouts and listeners, measured as wakeups below.

Main process: the optional features' main modules (boardmain, boardpinsmain, adobemain, deploymain, voicemain,
remotemain, phoneviewmain, interopmain, publishmain, gamemodemain, gamereadymain, gpuplaymain, directorgamemain,
assetsmain, hooksmain, costcoachmain, usagelimitsmain, packsmain, quickideamain) are already loaded on their first IPC
call (`lazyIpc`): with the feature off nothing calls them, so they never start. The few registered at start
(capturemain, notifymain, appsmain) only add handlers (no timers until used). main.js was not touched (the Lab-window
stream works there). One exception, said in the panel's words: Quick idea's key from any app (Ctrl+Alt+I) is its own
setting (Settings › Advanced › Keys); with the feature off the small window still opens and keeps the ideas, Hearth just
doesn't take them in until it's back on.

### Usage tracking (all local)
- `usage.js` (data/kv/ui-usage.json, this computer; sync may carry it to his other computer like any kv file — nothing
  goes to any server): every click on a control ("Area › Label"), Ctrl/⌘+K line ("Command palette › …"), chat command
  ("Chat command › /name"), opened tool / agent ("Open › tool:id"), agent tool call ("Agent tool › name"), some keys.
- New, minimal: lazy.js counts a group loaded **because someone used it** (a click / key / command, read from
  `navigator.userActivation`; never the start's background loads) in `localStorage['hub.trim.use']` (this computer only,
  never synced, never sent).
- Mapping: a feature's usage = the usage.js items matching its groups' commands + aliases, Ctrl/⌘+K lines, rail tools,
  app windows, agent tool prefixes (from the lazy manifest; lazy.js keeps them after a group loads: `Lazy.names(g)`) +
  a words pattern for its click names (`TrimData.WORDS[id].words`) + lazy.js' own count. Features that work by
  themselves (notifications, the cost preview by Send, Answered by Hearth, sparkle effects, Present ready) are marked
  `passive`: "works by itself", never suggested.

### The features

| | Area | Feature | Lazy groups | KB | Loads |
| --- | --- | --- | --- | ---: | --- |
| optional | Chat & AI | Voice (`voice`) | voice | 50 | start: voice |
| optional | Chat & AI | Phone remote & phone viewer (`phone`) | remote, phoneview | 37 | on use |
| optional | Lab extras | Live links (OSC, MIDI out, OBS, Ableton Link) (`interop`) | interop | 79 | on use |
| optional | Chat & AI | Find the answer ("what did we decide?") (`recall`) | recall, recallui | 14 | start: recall |
| optional | Chat & AI | Hooks (`hooks`) | hooks | 28 | start: hooks |
| optional | Chat & AI | Desktop notifications (`notify`) | notify | 25 | start: notify |
| optional | Chat & AI | Keep going & Auto-improve (`routines`) | routines | 113 | start: routines |
| optional | Chat & AI | Answered by Hearth (`localanswers`) | localanswers | 35 | start: localanswers |
| optional | Chat & AI | Cost preview by Send (`sendpreview`) | sendpreview | 45 | start: sendpreview |
| optional | Chat & AI | Quick idea window (`quickidea`) | quickidea | 30 | on use |
| optional | Chat & AI | Cost coach & Usage left (`costcoach`) | costcoach, usagelimits | 85 | start: costcoach, usagelimits |
| optional | Chat & AI | Usage dashboard (`usagedash`) | meterdash | 27 | start: meterdash |
| optional | Chat & AI | Studio pipelines (`studio`) | studio | 50 | start: studio |
| optional | Lab extras | Credits (`credits`) | credits | 40 | start: credits |
| optional | Help & tips | Tours & tips (`tours`) | discover, labtour137, quickstart, quickstartui | 156 | start: discover, quickstart |
| optional | Help & tips | What's new & patch notes (`whatsnew`) | whatsnew, patchnotes | 35 | on use |
| optional | Look | Button sparkle effects (`juice`) | juice | 17 | start: juice |
| optional | Boards & capture | Capture & visual feedback (`capture`) | capture, visualfeedback | 375 | start: capture |
| optional | Boards & capture | Mood board (`board`) | board, pinboard | 616 | start: board |
| optional | Boards & capture | Creative board (`creative`) | creative | 94 | on use |
| optional | Apps & publishing | App windows (Meshy, Suno, Figma…) (`apps`) | apps | 78 | start: apps |
| optional | Apps & publishing | Adobe apps (`adobe`) | adobe | 80 | start: adobe |
| optional | Apps & publishing | Publish websites (`deploy`) | deploy | 44 | start: deploy |
| optional | Apps & publishing | Ready to post (`publishkit`) | publishkit | 67 | on use |
| optional | Lab extras | Asset library (`assets`) | assets | 120 | start: assets |
| optional | Lab extras | Claude ⇄ Astra jam (`jam`) | jam | 61 | start: jam |
| optional | Lab extras | ▶ Play (games) (`play`) | gamemode, gameperf, gameready, directorgame | 362 | on use |
| optional | Lab extras | Variations (`variations`) | labvar | 34 | on use |
| optional | Lab extras | Frame budget bar (`framebar`) | framebar | 33 | on use |
| optional | Lab extras | Fix my scene (`scenedoctor`) | scenedoctor | 42 | on use |
| optional | Lab extras | Critique this (`critique`) | critique | 36 | on use |
| optional | Lab extras | My templates (`templates`) | labtemplates | 73 | on use |
| optional | Lab extras | All formats (`allformats`) | multiformat | 34 | on use |
| optional | Lab extras | Make a batch (`batch`) | labbatch | 67 | on use |
| optional | Lab extras | Text that moves (`kinetic`) | kinetictype | 61 | on use |
| optional | Lab extras | Music visualizer (`visualizer`) | labvis | 71 | on use |
| optional | Lab extras | Shapes (`shapes`) | labshapes | 63 | on use |
| optional | Lab extras | Present ready (`present`) | presentready | 33 | on use |
| optional | Lab extras | Looks for 3D things (`materials`) | labmaterials | 35 | on use |
| optional | Lab extras | Project look strip (`projlook`) | projlook | 25 | on use |
| optional | Lab extras | 3 takes (`takes`) | takes | 32 | start: takes |
| optional | Lab extras | Scene versions (`sceneversions`) | scenevers | 33 | on use |
| optional | Lab extras | Why is this slow? (`speedcheck`) | speedcheck | 43 | on use |
| optional | Lab extras | Make a layer like this (`refmatch`) | refmatch | 36 | on use |
| optional | Lab extras | How close am I? (`matchscore`) | matchscore | 41 | on use |
| optional | Lab extras | Perform (live mode) (`perform`) | perform | 38 | on use |
| optional | Lab extras | Explain this layer (`explain`) | explain | 40 | on use |
| optional | Lab extras | Draw a camera path (`campath`) | campath | 29 | on use |
| optional | Lab extras | Follow the music (`audiomap`) | audiomap | 19 | on use |
| optional | Lab extras | Scene outline (`outline`) | outline | 22 | on use |
| optional | Lab extras | Mood dials (`dials`) | dials | 53 | on use |
| optional | Lab extras | Favourite controls (`favs`) | favs | 28 | on use |
| optional | Lab extras | Map to the song (`songmap`) | songmap | 32 | on use |
| optional | Lab extras | Section moods (`sectionmood`) | sectionmood | 32 | on use |
| optional | Lab extras | Lyrics synced to the song (`lyrics`) | lyrics | 45 | on use |
| optional | Lab extras | Effect building blocks (`blocks`) | blocks | 32 | on use |
| optional | Lab extras | Recipes (`recipes`) | labrecipes | 67 | on use |
| optional | Lab extras | Direction (`direction`) | labdirection | 40 | on use |
| optional | Lab extras | Finish line (`finish`) | labfinish | 28 | on use |
| optional | Lab extras | Lab gallery (`gallery`) | gallery | 123 | on use |
| optional | Lab extras | Packs (.hearthpack) (`packs`) | packs | 45 | on use |
| optional | Lab extras | Review what a reply changed (`replydiff`) | replydiff | 29 | start: replydiff |
| optional | Lab extras | Plain words in the command bar (Lab) (`labsay`) | labsay | 30 | on use |
| **core** | Core | Chats (`chat`) | chatcmds, chatrest, chatwin, context, attachlean, dragdrop, handoff, historylean, chatsafe, chatfind, scenelink, memory, memorytidycore, notes, promptlib, addons, keyslines | 740 | start: chatcmds, chatrest, context, attachlean, dragdrop, scenelink, memory, memorytidycore, notes, addons, keyslines |
| **core** | Core | Astra and the AI programs (`astra`) | astraconnect, enginehealth, parityprobe | 69 | start: enginehealth |
| **core** | Core | Projects (`projects`) | projects, projmenu, projbundle, projectbrief, projtemplates, nextstep, projcreate, mywork, offlineprep, makesview | 610 | start: projects, projmenu, projectbrief, nextstep, makesview |
| **core** | Core | The Three.js Lab (`lab`) | lab, labintent, nodes, codeflow, kit, assist, directordock, directortask, directorcmds, compdispatch, scenecmds, labkeys, labsearch, searchcore, dropmedia, renderpre, preflight, renders | 4987 | start: labintent, nodes, kit, assist, directordock, directortask, directorcmds, compdispatch, scenecmds, renders |
| **core** | Core | Commands, command bar and Find anything (`commands`) | cmdbar, cmdpage, flows, appsearch, progressui | 455 | start: cmdbar, cmdpage, flows, progressui |
| **core** | Core | Settings and AI setup (`settings`) | appdialogs, options, connections, accessui, budget, metercmds, chrome, firstrun, trim | 397 | start: appdialogs, accessui, budget, metercmds |
| **core** | Core | Updates (`updates`) | updater | 23 | start: updater |
| **core** | Core | Sync and two computers (`sync`) | syncpanel, syncconflicts, keptaside, devices90, twocomputers, filewatch | 204 | start: syncconflicts, twocomputers, filewatch |
| **core** | Core | Safety nets (`safety`) | safetynet, datasafe, errorcalm, backupauto, versions, undoall, aiundo, activity, glrecover, diskcalm, resume, jankwatch, devreport | 494 | start: safetynet, datasafe, errorcalm, backupauto, undoall, aiundo, activity, glrecover, diskcalm, resume |
| **core** | Core | Screen, accessibility and calm (`look`) | bigscreen, a11y, idlecpu, polish8 | 63 | start: bigscreen, a11y, idlecpu, polish8 |

Core = what Hearth is for or what keeps work safe (chat, projects, the Lab core, settings and sign-in incl. Hearth's
Chrome, updates, sync, safety nets: backups, versions, undo, recovery, error notes, problem reports), plus shared
plumbing others need (searchcore, cmdbar, flows, appsearch, polish8, a11y, idlecpu). Codex-owned and off-limits files
(astra*, projects*, project-workspace*, workbench-*, visual-feedback.js, three-direction*, credits*) were not edited:
`credits`, `labdirection` (Direction) and `visualfeedback` (with Capture) are switchable from outside, through lazy.js.

## 2. Feature switches
- **Registry**: `HearthFeatures` at the end of `lazy-data.js` (eager, ≈ 2 KB): the switchable ids and their groups,
  eager buttons to hide (`HIDE`: the Moodboard / Creative board tabs, ↻ Auto-improve, ✦ Feedback) and keys-sheet areas
  (`KEYAREAS`). Words (name, area, one line, usage pattern, passive) and the core list are in `trim-data.js` (lazy group
  `trim`). `window.HearthFeatures = { enabled(id), list(), offIds(), offGroups(), groupsOf(id), featureOf(group), set(id, on) }`
  — the Lab window can load lazy-data.js and skip `HearthFeatures.offGroups()`.
- **Setting**: `localStorage['hub.trim.off']` (ids; this computer only). Core ids can't be set (`set()` → false).
- **Dependencies**: a group that needs (`after`) an off group goes off with it (Make a batch needs My templates and All
  formats; Section moods needs Map to the song and Mood dials); the panel says "Also off with them". Order-only needs are
  `SOFT` (quickstart → board, labsay → blocks). The check proves no core group needs a switchable one.
- **lazy.js** (read once at the start): an off group gets no stand-ins (chat commands, Ctrl/⌘+K lines, keys-sheet
  lines, rail tools, app windows, agent tool prefixes), isn't in the start queue, isn't loaded by a touched global or a
  key, and `Lazy.load()` refuses with `code: 'EFEATUREOFF'` (a toast only right after a click or key; appui.js's error
  catcher and habits.js keep it quiet otherwise). Keys-sheet lines in an off feature's areas from other groups (polish8's
  Board / Capture lines) are skipped. The feature's eager buttons are hidden by one `<style id="trim-hide">`.
- **Re-enabling is live** (`Trim.setFeature`, using `Lazy.kit()`): the stand-ins come back, a group that loads at the
  start loads at once. **Switching off** is live for what hadn't loaded (its commands go, its buttons hide); a group
  that had loaded (or has Ctrl/⌘+K lines, keys, rail tools, app windows) finishes after a reload — the toast offers
  "Reload now" (the window reload; chats and work are kept).
- Data: nothing is deleted or moved; off code simply never runs.

## 3. The panel
Settings › This computer & sync › **Trim Hearth…**; Ctrl/⌘+K "Trim Hearth…"; `/trim` (chat, command bar Ctrl/⌘+;).
Optional features, least used first: name, area, one line, "used N times · last used X" / "never used on this
computer" / "works by itself", weight ("616 KB · loads with Hearth · 2 background timers"), On / Off switch.
**Suggested** pre-selects what wasn't used for 30 days (on, not passive) — nothing changes until **Apply**. **All on**.
"Always on (10)" folded at the bottom. Forgeheart Redux: graphite `#111113` / room `#0b0b0c`, one hairline, gold
`#f4b63f` (title, switches, Apply), ember `#ff7a1a` (never used, a changed row's edge, notes), the gold → ember top line
(`trim.css`).

## 4. Dead code removed (verified: grep of the whole repo, the lazy manifest, boot-test)
| What | Size | Why it's dead |
| --- | ---: | --- |
| `tools/creative-preview.html` | 13.2 KB | the Creative board's old sandboxed game preview: no file loads it since the playground became stations (generated page) |
| `tools/creative-preview.js`, `tools/creative-preview.css` | 1.4 KB | only its build input |
| `dev/creative-preview-build.js` | 2.0 KB | built the page above; in no check list |
| `assets/shotgun-programme.svg` | 0.4 KB | the Shotgun programme icon of the removed Life tab: no reference |
| `assets/suno-shortcut.svg` | 0.4 KB | no reference anywhere |
| `docs/lazy-groups.md`: 14 notes of removed groups | 3.6 KB | questjournal, questcore, questhud, weekquest, weekendplan, leavesoon, tickets, invite, trynew, audiodoctor, sketchpads, refab, midilearn, dawsend |

Searched and found clean: no JS / CSS / HTML file without a reference except the above; no lazy group that can never
load; no preload channel without a handler; no global of Quests / Life / Music studio / VST left in code (only
comments, and the Creative board's `state.vst` validation, kept on purpose so saved data reads); CSS classes used
nowhere: only two in astra.css (Codex's, possibly built dynamically: left). `tools/creative-games.js` (10.7 KB) is
reached only by Codex's unit test `dev/creative-test.js` now: left (see For Codex).

## 5. Measured (`dev/trim153-measure.js`, this box: 4 shared CPUs, software GL; fresh profile, smoke harness)

| | Everything on | All 63 optional off | Saved |
| --- | ---: | ---: | ---: |
| First screen (eager code, before the first frame) | 1,546 KB, 62 scripts | 1,546 KB, 62 scripts | — (it's chat + rail) |
| Lazy groups loaded by the end of the start | 81 | 54 | −27 |
| Their code | 8,936 KB | 6,853 KB | **−2,083 KB** |
| Script files in the page | 423 | 337 | −86 |
| Repeating timers alive at rest (window) | 1 | 1 | — (lazy.js' 2-min one) |
| Window wakeups at rest (timeouts, intervals, frames, idle callbacks) | 0.3 / s | 0.1 / s | −0.2 / s |
| DOM nodes at rest | 1,069 | 939 | −130 |
| JS heap (coarse) | 24.8 MB | 24.0 MB | ≈ −1 MB |

(The smoke harness opens the calm-start gate at once, so "right after the first frame" and "after the start" read the
same here; the Lab group, 4.3 MB, is in both columns.) Before this round the first screen was 1,539 KB: the registry
and lazy.js' switch handling add 7 KB (budget 1,547).

## Checks
- **`dev/checks/trim153.js`** (group `trim153`): the registry covers every lazy group once; 63 switchable with words;
  no core group needs a switchable one; sizes present; core can't be switched off; usage numbers (3 uses → "used 3
  times · last used today", "never used on this computer"); Suggested pre-selects without saving; Apply saves; live:
  /variations gone, the board's tabs hidden, a reload offered; **after the reload**: the off groups never loaded, none
  of their files in the page, no commands / Ctrl/⌘+K lines / Board keys lines, `Lazy.load` refused calmly, the board's
  saved palette and the usage counts still there; **re-enabling is live**: /variations back, the board loads by itself,
  its commands and tabs back.
- Run: see the final report lines in the round's notes / commit.

## For Codex
- No Codex-owned file was edited.
- `tools/creative-games.js` is now reached only by `dev/creative-test.js` (the preview page that used it at run time was
  dead and is gone); keep it for the test or fold the test into the stations.
- `docs/upgrades/creative-playground.md` still mentions `node dev/creative-preview-build.js --check` (removed with the
  dead page).
