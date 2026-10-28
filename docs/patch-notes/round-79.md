# Round 79: sync only looks at what changed, a lighter Windows start
*October 2026*

## ☁ Sync looks only at what changed
- Sync is much lighter on big Hearth folders: after a change it now checks only the files that changed instead of every
  file, about 160 times fewer file checks at 50,000 files.
- On Windows with OneDrive and Defender, a sync after a change takes about a second instead of about 13 seconds at that
  size, and the computer's disk stays quieter while you work.
- Nothing to set up: it works on the Mac and the PC on its own.
- As a safety net Hearth still looks at everything when it starts, after the computer wakes, when you click Sync now,
  every half hour while it's idle on mains power, and at least every 6 hours.
- If the computer misses a change notice (it happens with network drives and cloud placeholders), Hearth notices by
  itself, syncs that change and double-checks everything right away.
- A chat you delete stays deleted on both computers, even if a notice about it was missed.

## 🪟 Engines and the first ▶ Play
- Hearth checks your Claude Code and Codex installs without pausing: it remembers where they are and only looks
  everywhere again when something changed, when you run /doctor, or after an install or update.
- If you signed out of Claude Code or Codex, Hearth still notices right away.
- ▶ Play opens without a hitch: if you played a game recently, Hearth gets ▶ Play ready in the background a little after
  it starts, and building the scene's page no longer freezes the app for a moment.
- Pressing ▶ Play again after changing a scene is quicker: three.js is no longer copied again every time.

