# Round 135: the player keeps your jumps
*November 2026*

## ▶ Jumping in the song right after play
- Pressing play and then clicking on the timeline (or a cue jump, or Perform's number keys) could lose the jump: the
  song started again from the beginning, or jumped a second late. Two causes are fixed: the song, still loading,
  reset itself to its start once it knew its length, and a jump waited behind the previous one's answer. In our test
  (play then jump, 0 to 200 ms later, hundreds of times) the jumps now land where you clicked.

## 🎛 Mood dials
- The Sliders panel's ⋯ › **🎛 Dials…** (or the Lab's ⋯ › 🎛 Dials): up to 4 knobs for the whole scene, like Energy,
  Darkness, Chaos and Warmth. Each moves many sliders across your layers at once; letting go is one Undo.
- **Suggest** makes dials from your sliders' names, free (the scene as it is sits at 50 %). **✦ Suggest dials** asks
  the AI (cost shown first); keep or ✕ each. **● Learn**: set the sliders where you want them at one end, press
  ✓ This end, then the other.
- **◆** puts a key at the playhead so a dial moves over the song (renders follow), a dial can **follow the music**,
  and in **Perform** ↑ / ↓ turn the selected dial and [ / ] pick another.
