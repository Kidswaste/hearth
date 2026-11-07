# Smooth playback first, with a "Force high quality" switch (round 142, smooth142)

The owner asked: "Focus on making scene playback smooth even if it deteriorates the quality, and let me force the
quality in case i need it to be high." This round makes the Lab preview **smooth-first by default** and adds a
**Force high quality** choice in the existing quality chip. Renders are never touched.

## Before / after

BEFORE_AFTER_TABLE

## What changed

WHAT_CHANGED

## Where he clicks

- The stats line under the preview shows the quality chip: **Quality: auto** (Smooth), **Quality: auto · 70 %** while it
  draws lighter, **Quality: balanced**, or **Quality: high**. Click it (or right-click it) for the menu:
  **Smooth (auto) · Balanced · Force high quality**. The last line of the menu says whether the pick is this scene's own
  and what the default is.
- The pick is kept **for this scene** and becomes **the default** for scenes that have no pick of their own.
- Pointing at the chip says what Smooth lowered and why (for example "70 % resolution, filters at half size (frames
  dropping)").
- **⚡ Speed check** (⋯ › This Lab, or ✦ More) shows one more line at the top: "Quality: Smooth (auto) · level 4 of 9 ·
  50 % resolution, filters at half size (frames dropping)".
- The right-click › View › **Quality: auto** row still switches between Smooth and Force high quality (as the default).
- ◉ Perform plays at the screen's own rate (as before) and uses the scene's choice: Smooth unless he forced high quality.
  ▣ Present still holds full quality (round 52), as before.

## Tests

TESTS

## For the patch notes

PATCH

## For Codex

Nothing. No Codex-owned file was touched (no astra*, codex-*, projects*, project-workspace*, sync-engine.js,
cloud-files.js, workbench-* or engine-watch).
