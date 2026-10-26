# ⚑ Finish lines (round 67, stream 5)

The problem: ideas don't get finished, because "done" is never written down. When nothing is quite right, a small
tweak feels pointless. Now each Lab scene can have a **finish line**: a size, a short "done when" list, and a button
that turns what's left into three small steps.

## Where to click

1. Open the **Three.js Lab**. Right after the scene picker in the toolbar there's a new chip, **⚑ Finish line**.
2. Click it. A small card opens over the top right of the preview.
3. **Size**: pick **10 s**, **30 s** or **Full**.
   - On a scene with no song, 10 s / 30 s set the scene's own timeline to that length. The note says so, and the
     toast has **Undo**, which puts the old timeline back.
   - On a scene with a song, the song stays. Record it then takes that many seconds from the playhead.
4. **Done when**: each size starts with a few lines:
   - 10 s: One clear idea · Loops cleanly · Sound fits
   - 30 s: A clear start, middle and end · One moment that surprises · Sound fits the cuts · Nothing looks broken at full size
   - Full: Strong first 5 seconds · Changes with each part of the song · Ends on purpose, not just stops · Sound and picture stay together · Looks right at the size you'll post

   Tick a line when it's true. **Click a line's words** to change them (Enter keeps them, Esc cancels). **✕** removes
   a line (Undo in the toast). **+ Add a line** adds one (up to 8). **Back to the defaults** shows once you've edited
   the list. Edited lists stay the same when you change the size.
5. When every line is ticked, the card says **"✓ Done. This piece is finished."** and the chip turns gold
   (**⚑ 10 s · done ✓**). Two buttons show up:
   - **⏺ Record it**: the Lab's own recorder. 10 s / 30 s record that length (from the start of a scene's own
     timeline, or from the playhead on a song). Full records the whole song or timeline once.
   - **More ways to record…**: the timeline's usual record menu (the loop, whole song, from here, fps, quality).
6. **✦ Polish this** (always on the card, marked "made here, 0 tokens"): the card shows **three small steps**:
   - your unticked lines first, in order, each turned into one concrete step that names the line ("Make the seam
     invisible … Then tick 'Loops cleanly'");
   - if fewer than three lines are left (or all are ticked), the rest comes from a short look at the scene: watch it
     through once (with its length), change only that moment (naming up to four of its visible layers), record it and
     watch it back.

   Then pick one:
   - **✦ Track + guide me**: adds it to your side quests and opens the step-by-step guide beside the Lab with the same
     three steps. Each step is ticked off by hand with a short note, as the guide always does.
   - **Track it**: only adds the side quest (the quest tracker chip shows it; the toast's **Show** opens the tracker).
   - **Not now**: nothing is saved.

   If you already have 3 side quests, the card says plainly: *"You already have 3 side quests. Finish, park or skip one
   first, then press Track again."* with an **Open the quest tracker** button.
   In the guide, **↗ Work** opens the Lab and switches to that quest's scene.

Also: Ctrl/⌘+K → **"Lab: ⚑ Finish line"** opens the card.

## How it's built

- `tools/three-finish-core.js` (`FinishCore`, UMD): sizes, default lines, tick / rename / add / remove / reset,
  progress, the chip's words, `polishSteps` (always exactly 3), `quest()` (a side quest in QuestCore's shape:
  `q-finish-<scene hash>-<n>`, path `visual`, tool `lab`, 15 min, 40 XP, plus `finishLine: { v: 1, sceneId }` and
  `guideSteps`), `guideStart()`.
- `tools/three-finish.js` (`LabFinish`): the chip, the card, size → timeline, Record it, Polish this. Its own lazy group
  `labfinish` (after `lab`, loads right after the first screen), so the giant `lab` line in `lazy-data.js` is untouched.
- `tools/three-finish.css`: chip + card. It reuses lookmatch's `.lm-head` / `.lm-btn` / `.lm-acts`.
- Data: per scene in the Lab's extras (`ThreeLab.scenes.setExtras(id, { finish })`, kv `three-lab-extras`). That means
  it syncs, copies with duplicated scenes, and is never written over an extras file the Lab couldn't read (the Lab's
  own `kvOk` guard).
- Quests go only through public APIs: `QuestHud.write((s) => QuestCore.trackSide(s, q), …)` (the journal's own
  read → validate → change → validate → save, or the Studio's `mutate` when it's open) and
  `window.hub.questGuide({ op: 'start', questId, title, kind: 'custom', steps })`. The guide's "↗ Work" for these quests
  is followed through `hub.onQuestGuideTool` (questId `q-finish-…`, tool `lab`) to open the scene.
- No timers, no polling: it repaints on `hearth:lab-ready`, `hearth:sketch` (scene switch) and
  `hearth:lab-scenes-arrived` (sync), and when you click.
- No model call anywhere. The "write the 3 steps with AI" option was **not built** (the local steps are the default
  the brief asked for; an AI version would need its own click and a way to read its answer back).

## Tests

- `node dev/finishline-test.js`: 13 Node tests on the core. Sizes and defaults, size changes (untouched vs edited
  lists), done / un-done, add / remove / reset / limits, junk data, every default line maps to a concrete rule, exactly
  three steps in every case, and the side quest passing `QuestCore.validate` + `trackSide` and the 3-side-quest
  limit. Runs on a fresh journal in memory, never your data.
- `dev/checks/finishline.js`: an in-app check for the smoke harness (`node dev/smoke.js --script dev/checks/finishline.js`).
  It makes a throwaway scene and checks the chip placement, the card, 10 s → three lines + 10 s timeline, editing a
  line by click + Enter, Polish → 3 steps, Track + guide me (into a stand-in journal and guide via `LabFinish._seam`,
  never the real `quest-journal`), the 3-quest limit message, and all ticked → done + Record it. Then it removes the
  scene.
- `node dev/lazy-groups-test.js` passes with the new group. All new files pass `electron --check`.

## Not verified live

- **Not run in the real app.** The smoke harness (`dev/smoke.js`) is set up for Linux/Xvfb. On this Windows machine,
  a copy would register the global hotkey and could touch Start-with-Windows / Desktop shortcuts, so
  `dev/checks/finishline.js` hasn't been run yet. Worth running in the cloud container or a safe copy.
- Not checked live: the chip's spot in the toolbar after the Lab's toolbar regrouping (`.tb-group`) or declutter
  hiding, the card's spot next to other preview cards (∞ loop card is top left, this one is top right), and the
  Record it paths (`cmd.recordSpan({ seconds })` / `cmd.record('track')`; with no timeline it opens the record menu).
- The guide opening the right scene from "↗ Work" (it relies on `questguide:tool` reaching every listener).

## For Codex

No Codex-owned files were edited. One optional, additive suggestion: `questguide.js` `customSteps(q)` could return
`structuredClone(q.guideSteps)` when `q.finishLine?.v === 1 && q.guideSteps?.length`, so a ⚑ polish quest started
from Sidequest Studio (rather than the card's "Track + guide me") gets its three scene steps instead of the generic
ones. Starting from the card already uses them, and a guide started there resumes with them.
