# Round 135: the player keeps your jumps
*November 2026*

## ▶ Jumping in the song right after play
- Pressing play and then clicking on the timeline (or a cue jump, or Perform's number keys) could lose the jump: the
  song started again from the beginning, or jumped a second late. Two causes are fixed: the song, still loading,
  reset itself to its start once it knew its length, and a jump waited behind the previous one's answer. In our test
  (play then jump, 0 to 200 ms later, hundreds of times) the jumps now land where you clicked.
