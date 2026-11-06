# Round 137 · tour137: ◈ What's new in the Lab, a short tour and a feature list

Rounds 128–136 gave the Lab about two dozen new things in a short time: the brief, the first draft, the project look,
next step, templates, 3 takes, map to the song, critique, a layer like this picture, render presets, Perform, explain a
layer, scene versions, lyrics, camera paths, the speed check, blocks, follow the music, my work, mood dials, the layer
list and the phone. The owner hasn't tried most of them. This round adds one short tour of them and one list of all of
them. Both use what Hearth already has. No new toolbar row, and nothing stays on screen.

## What existed (and what this round does with it)

| Piece | What it does | This round |
| --- | --- | --- |
| **✦ Since you were away** (whatsnew, round 42: `whatsnew*.js`) | After an update with 2+ rounds, one card with the top changes (≈ 12 lines) built from the patch notes, Show me on each, Read the full notes. Also a bigger dialog (Ctrl/⌘+K, Settings › Updates & what's new › What's new…). | **Extended:** one small **◈ New in the Lab** button in the card's foot and the dialog's buttons (a menu: the tour, Lab features…). |
| **Guided spotlights** (tour, round 15: `tour.js`, `discover-data.js`) | A ring on the real control and one small card (Back · Next · Try it · ×), steps with an `open` and a `target`, Skip / Later for skippable tours, Esc pauses and the same command picks up there. Tour.pulse rings any control for a few seconds. | **Reused** as the tour's engine, with 4 small additions (below). |
| **Try what's new** (newtour64), **What's new for me** (`discover.js`) | Hands-on tours of rounds 61–63; the docs/upgrades lines that fit the owner's habits. | Unchanged. |
| **First run** (`firstrun*.js`) | "Is this computer ready?": engines, sign-in, ffmpeg, one fix button each. | Unchanged (it is about the computer, not features). |
| **Patch notes viewer** (`patchnotes.js`, `Updater.patchNotes`) | Every round's notes, one round per page. | Unchanged; the feature list's lines come from the same rounds. |
| **Ctrl/⌘+K** (`appui.js` actions, `lazy-data.js` stand-ins) | Find anything: every action, command, setting. The Lab's features have actions like "Lab: Critique this scene", "Lab: 🎛 Mood dials". | **Two actions added:** "Lab: what's new (a 2-minute tour…)" and "Lab features…". The list's Open runs the existing actions. |
| **Keys sheet** (`keys-ui.js`) | Every shortcut. Esc already says "Pause a guided tour". | Unchanged. |
| **Hints** (hintcalm, round 38: `hints.js`) | One optional note at a time, never while typing or over a dialog, a Lab tip waits for the Lab, remembered once shown, silenced by "Don't show tips". | **Reused** for the once-only note. |

## What's new, and where the owner clicks

### The note (once)
The first time the Lab is on screen after this update, a small one-line note shows at the bottom left:
**◈ New in the Lab: 12 things · Show me (2 min) · Later · ✕**.
- It goes through Hints (a Lab tip): never while typing, never over a dialog, one note at a time, and not at all with
  Settings › Updates and tips › **Don't show tips**.
- Once shown it is remembered (store `labtour137.note`). It never pops up again by itself, whatever is clicked.
  Later says "Any time: Ctrl/⌘+K › Lab: what's new".

### The tour (12 steps, about 2 minutes)
Each step rings the real control and says in one or two short sentences what it does. Buttons: **Show me**, **Next**,
**Skip tour** (and ‹ Back). Esc closes an open menu or card first, then pauses the tour.

| # | Feature | The ringed control | Show me |
| --- | --- | --- | --- |
| 1 | ✦ Critique | ✦ Critique in the director dock (opens the dock if it's folded) | the critique card: the cost only, nothing sent |
| 2 | ✦ Explain this layer | Sliders ⋯ › ✦ Explain this layer (opens the Sliders panel and the menu) | the explain card: the cost only |
| 3 | 📁 A tidier layer list | the Layers ⋯ | its menu, ✦ Name these for me ringed |
| 4 | 🕘 Scene versions | Sketch ▾ › History › 🕘 Scene versions… (opens both) | the versions list |
| 5 | ⚡ Speed check | the Lab's ⋯ › ⚡ Speed check | the speed card (measures for 3 s, no AI) |
| 6 | ⇪ Render presets | ⇪ Render | the Render card with its Presets row (nothing renders) |
| 7 | ◉ Perform and 📱 phone | right-click ▣ Present › ◉ Perform | the same menu, 📱 Live on my phone ringed |
| 8 | ★ My work | the picture (right-click › ＋ Add › ★ From my work) | the My work browser |
| 9 | 🎛 Mood dials | Sliders ⋯ › 🎛 Dials… | the dials card, **on a demo copy** |
| 10 | 🎚 Follow the music | Sliders ⋯ › 🎚 Follow the music… | the follow card on a slider, **on a demo copy** |
| 11 | 🧩 Effect blocks | the Lab's ⋯ › 🧩 Blocks | the blocks card, **on a demo copy** |
| 12 | 🎥 Camera paths | the picture (right-click › 🎥 Camera moves › ✎ Draw a camera path) | path mode, **on a demo copy** |

- **Nothing is sent to an AI** by the tour. Steps 1–8 only show something that costs nothing; steps 9–12 could change
  the scene, so the first of them makes **"◈ Tour demo (a copy, removed after the tour)"**, a copy of the scene, and
  opens it. When the tour ends (Done, Skip tour, ×, Esc), the owner's scene is opened again and the copy is removed
  (it sits in the Lab's History › deleted, like any deleted scene). The owner's scene is never changed: the copy is
  made without saving the scene left (scenes.create's own `open` saves it with a new date even when nothing changed).
- **Any window size**: a control in a folded menu (the Lab's ⋯, the Sliders ⋯, Sketch ▾ › History, Present's
  right-click) gets its menu opened first; a control in a scrolled panel is scrolled into view; the Sliders panel is
  opened when it's closed; the card stays inside the window.

### Lab features… (the list)
Ctrl/⌘+K **Lab features…**, the ◈ New in the Lab button, or the tour's last line. A dialog with a search field and
24 lines, newest round first: icon, name, one line, round, **Open**. Search takes plain words, a few other words for
the same thing (slow → speed check, knob → dials, phone, lyrics…) and one-letter typos.
- **Open** goes through what Hearth already has, so it stays in sync: a Ctrl/⌘+K action (by the start of its label,
  e.g. "Lab: Scene versions"), a chat command that only opens something (`/speed-check`, `/blocks`, `/camera-moves
  draw`, `/brief show`), or the tour step's place (ringed). Four have their own small place: the project look (rings
  ◆ when the scene has a project palette), next step (Find anything on it), 3 takes (rings ✦ 3 takes beside Send)
  and My work.
- The list is `labtour137-data.js`. The check reads the round 128–136 patch notes and fails if a part has no line
  (except the 3 parts with nothing to open: the tidier toolbar, cheaper messages, the player fix).

### Ways in
Ctrl/⌘+K "Lab: what's new" and "Lab features…" · ✦ Since you were away (card and dialog) › ◈ New in the Lab ·
Settings › Updates & what's new › What's new… › ◈ What's new in the Lab / Lab features… · the once-only note.

## How it's built
- **`labtour137-data.js`** (pure, Node-loadable): `STEPS` (12), `FEATURES` (24, each with its patch-note part and its
  Open), `search`, `openOf`, `parts`.
- **`labtour137.js`**: the note (Hints), the step places (open the menu, scroll, return the control), Show me, the demo
  copy, the list, the two Ctrl/⌘+K actions.
- **`labtour137.css`**: the note and the list.
- **`tour.js`** (4 small additions, marked `(round 137, tour137)`): `step.demo` (a Show me that opens the feature, and a
  modal it opens takes the card in), `tour.skipText` / `tour.noLater`, `tour.escSoft` (Esc closes a menu or dialog
  first), and the ring/card above a top-layer menu (`#menu` is a popover) and hidden when its menu row went away.
  Also a fix for every tour: a step whose control was slow to open (a row looked for in a submenu) could finish after
  Next and paint its own card over the next step; the latest step now wins.
- **Lazy group `labtour137`** (after `lab`: it follows the Lab, loading once the Lab is in, after the calm start).
  The tour loads `discover` (tour.js) when it starts. Nothing on the first screen: boot-test 62 scripts, 1585 KB of
  code (budget 1586 KB, unchanged).
- Small hooks: `whatsnew.js` (the ◈ New in the Lab button), `appui-dialogs.js` (two rows in What's new…).
- **Fixed in passing** (`whatsnew-core.js`): the Since you were away card showed stray `**` on round 136's "A tidier
  layer list" line (a bold cut where its bullet wrapped). The whatsnew check had been failing on it since round 136.
- In a test copy (smoke.js) the note is offered only when a check sets store `labtour137.auto`, so other Lab checks
  never meet it.

## Tests
One check, `dev/checks/tour137.js` (group `tour137`), on a scene it makes in smoke.js's throwaway data:
1. the note shows once (one line, inside the window); after Later, and again after ✕, offering it again shows nothing;
2. the 12 steps: each control exists and is ringed (the ring on it, inside the window), 7 of them in a folded menu
   opened first; each card has Show me, Next and Skip tour; Show me opens each feature (a probe per feature), steps
   1–8 on the scene, 9–12 on the demo copy;
3. after Done: the scene is open again, the demo copy is gone, the scene's data is byte-identical (record, layers,
   extras), no engine event came and no reply is running;
4. Skip tour ends it: no card, no ring, no menu left;
5. Lab features…: all 24 lines, each Open really there (action, command or place), every round 128–136 part covered,
   search (slow, phone, knob, a typo, nothing), Open through an action (Scene versions), a place (Render presets) and
   a command (Why is this slow?); the two Ctrl/⌘+K actions; ◈ New in the Lab in the Since you were away dialog;
6. at 860 × 560: all 12 steps ringed inside the window with the card inside it (not under a dialog), and the list fits.

Run: `flock /tmp/hearth-run.lock timeout 2400 node dev/run-checks.js --exact tour137 whatsnew qa-commands labchat92`
and `node dev/boot-test.js`.

## For the patch notes
## ◈ What's new in the Lab
- The first time you open the Lab after this update, a small note says **New in the Lab: 12 things**. **Show me (2 min)**
  starts a short tour. **Later** or **✕** close it, and it won't pop up again.
- The tour rings each new button, one at a time, with one line on what it does. If the button is inside a menu, the
  menu opens first. **Show me** opens the feature. When it could change your scene, it opens on a copy of your scene,
  and the copy is removed at the end. Your scene stays as it is, and nothing is sent to the AI. **Skip tour** ends it.
- **Lab features…** lists every new Lab feature since round 128, with one line each and **Open**. Type to search
  ("slow", "phone", "lyrics"…).
- Find them any time: Ctrl/⌘+K "Lab: what's new" or "Lab features…", or **◈ New in the Lab** on the Since you were
  away card.
- Fixed: the Since you were away card showed two stray stars (**) on one line.

## For Codex
No Codex-owned file was touched (astra*, codex-*, projects*, project-workspace*, sync-engine.js, cloud-files.js,
workbench-*, engine-watch.js). New store keys are this computer's own (`labtour137.note`, and `tour.progress` gains a
`lab137` entry). The tour's demo copy is an ordinary Lab scene, made and removed with `ThreeLab.scenes`, so it syncs
like any scene for the few minutes it exists; no new store and no new sync kind.
