# Round 133: lyrics, camera paths and "Why is this slow?"
*November 2026*

## 🎤 Lyrics synced to the song
- Sections ▾ › **🎤 Lyrics synced to the song…** (or ＋ Add › 🅰 Type, or `/lyrics-sync`). **Paste…** the lyrics or
  **Open file…** (.lrc, .txt, .srt).
- **✦ Auto-time** places the lines on the song's bars and sections, free and on your computer. **🎤 Tap to time**:
  play the song and press Space at each line (snapped to the beat), Enter to keep.
- The lines show as blocks on a lane under the song, the one being sung lit up; drag a block to move it (it snaps to
  the beat, Alt moves it freely). One Undo per change.
- **＋ Add a lyrics layer** in your palette, with 7 styles to preview (Karaoke, Word on the beat, Soft fade, Calm,
  Punchy, Typed, Scroll), size, position and kick sliders. **Per section** gives each part its own style for free;
  **✦ Style the lyrics** asks the AI (cost shown first).

## 🎥 Camera paths
- Right-click the preview › 🎥 Camera moves › **✎ Draw a camera path**. Drag to look around, click to drop points:
  a smooth curve runs through them. Drag a dot to change it (one Undo each); **Esc** or **Done** to finish.
- **⋯**: over the whole song, the loop or a section; snap to bars or one point per section; smooth, linear or "hold
  then move on the beat"; **≋ Shake on the kick**. **▶ Preview** plays it. Renders, the Stage window and Perform use
  it like any camera move.

## ⚡ Why is this slow?
- When the preview stays slow for a few seconds while playing, a small **"Slow: N fps · Why?"** chip shows above
  the stats line (✕ hides it for that scene). Also ⋯ › **⚡ Speed check** or `/speed-check`.
- It measures for 3 seconds on your computer (no AI) and lists the 3 heaviest causes in plain words, each with a
  one-click fix and the gain to expect: for example "Preview at 1× pixels", "Antialias off for the preview only",
  "'Particles' draws 400k triangles: cut to 100k", "Shadows on 3 lights: keep 1". Each fix is one Undo, and the card
  measures again to show the new fps. Preview-only fixes never change your renders.
- If the graphics card resets, it offers to **reopen the scene in safe mode** (1× pixels, no antialias, no shadows).
