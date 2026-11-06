# Round 140: a check before you render, and drop media on the timeline
*November 2026*

## ✅ Before you render
- Pressing **⇪ Export** (or ⇪ Export N presets, or a batch's ⇪ Make) now checks the scene first, on your computer,
  in a blink. If all is well the render starts as before. If not, a small **Before you render** card lists each
  problem in one line, with a one-click fix:
  - a missing reference, model or song → **Relink…**; a file the code uses that the scene doesn't have → **Add the
    file…**
  - an error in a layer → **Hide** it; no song (or a silent one) for a preset that follows the song → **Add a song…**
  - a 9:16 project rendered 16:9 → **Switch to 9:16**
  - a very slow render ("4K at 60 fps would take about 40 min") → **Render at half size** / **at 30 fps**
  - not enough disk space → **Render at half size** / **Save somewhere else…**
  - solo left on, or most layers hidden → **Turn solo off** / **Show every layer**
- The card shows "⏱ about N min · ~X MB", checks again after each fix, and **Render anyway** is always there. The
  Render card's summary now ends with the same estimate.

## ⤓ Drop media on the timeline
- Drag pictures, clips or a song from your computer (or a moodboard picture, or a card in 🖼 References) onto the
  Lab's timeline: a **picture** plays from where you drop it to the next cue or section end, with fades; a **clip**
  becomes footage as long as the clip; a **song** asks before replacing yours.
- Several files line up one after another on the bars (hold **Alt** for beats, or for one file to place it exactly).
  A thin bar shows where each will land while you drag. Dropped layers go in a "Dropped" group in your palette's
  colours, and each drop is one Undo.
