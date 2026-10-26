# credits67 (round 67, stream 4): the credit log and "How it was made"

Quentin works in an industry that rejects AI-generated art, and he won't lie about who made what. So Hearth keeps an
honest credit log for each piece (a Lab scene), shows it as plain credits he can copy, and makes a short "How it was
made" video from the piece's versions. Nothing is uploaded.

## Where to click
- **Lab → toolbar → Credits** (just before the 📷 screenshot button). It opens the credits for the scene on screen.
- In the panel:
  - the credit lines, then **Copy** (one paragraph) and **Copy with the Sound desk totals**;
  - **Your name in the credits** (default "Quentin") and **The starting code was** (not recorded / written by me /
    written by an AI / a Hearth template / from elsewhere). The log can't know who wrote a scene's very first code, so
    this is your own note, and the credits say so ("as Quentin noted it");
  - **Recent**: the last 10 short notes ("Claude: Code run · main…", "Asked Claude: “make it glow…”");
  - **How it was made**: **9:16 (phone)** or **16:9 (wide)**, **Choose folder…** or **Use the export folder** (the same
    folder Lab exports use, else `~/Hearth exports`), then **Make the video**. When it's done: **Show in folder**.
  - **Close** or Esc.

## What it records (credits.js, kv `credit-log`)
Counts and a few short notes per piece, never every event (credits-core.js keeps ≤ 300 version ids and ≤ 10 notes per piece).
| What | Heard from (nothing in those files was edited) | Counted as |
|---|---|---|
| Lab versions | `hearth:tm` → `ThreeHistory._doc(id)` (the version's `by` and `kind`) | `by: claude/codex/crew` = AI edits; `by: you` + run = code by hand, layers, sliders saved, shuffles kept, turn = other hand edits; restores, branches and "Opened" are no one's work |
| Prompts to a director | the turn bookmark's `mark` on the same versions | "Direction: Quentin (12 prompts to Claude)" |
| Slider moves, saved or not | a trusted `change` on a range / number / color / choice inside the `.tweaks` panel, or a click on a choice button | one per let-go; covers the time machine's gap (unsaved moves by "you" aren't a version) |
| Sound desk | `WorkbenchVST.api.on('params')` (attached with `Lazy.when('creative')`) | `desk` = a knob gesture by hand, `editor` = the plugin's own window closed with changes, `ai-chat` / `preset-hover` = AI patch changes, `preset` = a saved preset loaded (whose it is: not recorded) |
| Recordings | document `hearth:quest-week` (`park-jam`, `park-song`, `live-set`) | "Recorded: 2 park loops (played by Quentin)" |

The Sound desk and recordings aren't tied to a scene, so they're counted in the scene that was open in the Lab at the
time (and always in the desk's own totals). That's written in the panel too.

Writes: 2.5 s after the last change, at once when the window is hidden or closes. No timers otherwise, nothing runs while
hidden. If the log can't be read (and the store has no copy), nothing is recorded or written and the panel says so: a
read failure is never treated as an empty log. The log syncs like any kv file when sync is on (not added to
`LOCAL_FILES`; `sync-merge.js` wasn't touched). The panel says it stays on this computer and in the sync folder.

## The wording (CreditsCore.credits)
It never says more than the data: missing parts read "not recorded".
- AI first, then hand: "Visual code: AI-drafted (Claude: 12 edits, Codex: 3 edits), then edited and tuned by hand by
  Quentin: 34 edits, 120 slider moves (20 to the code, …)".
- Hand first: "started and edited by hand by Quentin: …, with AI edits (Claude: 2 edits)".
- Only one side: "by hand, Quentin: …; no AI edits recorded" / "written by AI (…); no hand edits recorded".
- "Starting code: not recorded" until you pick something.
- **Before the log**: when the time machine has versions older than the log for this piece, the credits list them as
  lower counts (the time machine thins old history).
- "Direction: …" only with recorded prompts. When there are AI edits but no prompts, it says "Direction: not recorded".
- Sound: "tuned by hand by Quentin in Serum 2 (40 knob moves, 2 sessions in the plugin's own window); 3 AI patch
  changes in Serum 2 (✦ Preset)", or "not recorded (the Sound desk wasn't used while this scene was open)". The log
  never says "played" from knob moves. Only a recording says played.

## "How it was made" (Credits.makeReel)
1. `CreditsCore.reelPlan` groups the time machine's versions into chapters (same hand doing the same kind of thing) and
   keeps up to 8 stills: the start, the biggest chapters, and always the last one. Cards: "Start: AI draft" (only when
   you said so) / "Start: the scene as first recorded", "Claude edited the scene (5 edits)", "Quentin re-tuned the
   sliders (3 edits)", "Quentin edited the code by hand", …
2. Each still: `ThreeHistory.preview(vid)` shows the version on the preview (the time machine's own scrub, nothing
   saved), then a wait of 1.1 s, then `ThreeLab.director.shot()`. That's the preview at its size, far bigger than the
   120 px thumbs. A failed shot falls back to the thumb, and the card says "small picture". In a `finally`,
   `ThreeHistory.endScrub(false)` puts the scene back exactly as it was (sliders included). The panel stays over the
   Lab while it runs. A scene switch stops the video.
3. Frames are drawn on a canvas (1080×1920 or 1920×1080): the still fit inside, the card under it, then a closing
   credits card. They're written as PNGs in `<folder>/.hearth-titles-cr…` (the name aemain.js's `video:rmtemp` and
   Disk calm already know), cut with `CutData.ffmpegArgs` (picture clips, 0.25 s fades) and rendered with
   `hub.video.transcode`. Each still lasts 1.6–3.5 s and the credits card 3.5 s, scaled so the video is 10–20 s
   (`reelTimes`). The temporary folder is removed afterwards.
4. Saved as `<scene> - how it was made 9x16.mp4` (a free name). Nothing is uploaded.

## Files
- New: `credits-core.js` (pure, Node-tested), `credits.js`, `credits.css`, `dev/credits-test.js`, `dev/checks/credits.js`.
- Changed: `lazy-data.js` (one GROUPS line: `credits`, a 'soon' group with no commands, so the generated META part is
  unchanged).
- Not edited: tools/three-history*, tools/three-tweaks.js, tools/three.js (the button is put into `.three-toolbar` from
  outside on `hearth:lab-ready`), tools/workbench-vst.js, parkjam / loopsong / liveset, sync-merge.js, HANDOFF.md,
  FEATURES.md. No new event was needed.

## Tests
- `node dev/credits-test.js`: 52/52. It covers sorting versions into sides, dedupe (versions and prompts), the size
  limits, sound sources, recordings, every wording branch incl. "not recorded", before-the-log counts, healing a
  damaged log, the reel plan, its 10–20 s timing and the cut.
- `credits.js` was loaded in Node with stubbed globals (scratch script, not kept): versions, a prompt, desk hand vs AI, a
  trusted slider move (an untrusted one ignored) and a recording all landed in the saved log.
- `electron --check` on every new file.

## Not verified live
- Hearth wasn't run. `dev/checks/credits.js` (button, panel, Copy, Escape) was written for `node dev/smoke.js --script
  dev/checks/credits.js` but not run.
- The video was never rendered: the scrub → shot → put back loop, the frame drawing and the ffmpeg run are untested
  on a real scene. Also untested: whether 1.1 s is enough for a heavy scene to draw after a version switch.
- The Sound desk hook with a real plugin (Serum 2 / Vital), and the `editor` source.
- The toolbar placement on a narrow window (the button is a small ghost button and may wrap).

## For Codex
Nothing in Codex's files was changed. The credit log only listens to `WorkbenchVST.api.on('params')` and
`hearth:quest-week`. If those event sources are renamed, credits.js's list (`desk`, `editor`, `ai-chat`, `preset-hover`,
`preset`, `undo`) needs the new names.
