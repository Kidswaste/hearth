# Round 109: no more stuck project opens, reliable Desk menus, a Lab safety net
*November 2026*

## 📁 Opening projects
- Opening a project no longer gets stuck on "Warming shaders" for a minute and a half (and then fails) when you go to
  the project's Desk while it's still opening. It finishes right away, and the scene is ready when you go back to it.
- A click on a project's ⋯ button no longer gets lost when the Desk refreshes at that moment (after a sync, a rename,
  or an export finishing).
- Menus no longer slide while they open, so a quick click on a menu row can't land on the row above it (for example
  "Export project…" opening "Notes…" instead).
- Importing a project: Hearth starts loading the Lab while you look at the import card, so the import itself is a
  little quicker.

## 🛡 A safety net for runaway Lab scenes
- **Behind the scenes: the Lab's speed checks now play a scene like yours.** Several layers, a 3D model with its
  picture, a glow filter, a song with ⚡ triggers and several things following the beat at once, on a fast screen. The
  bug from two updates ago (a scene with two or more beat reactions made the preview work harder and harder until it
  restarted) passed the old checks; these ones catch it.
- **A safety net in the preview.** If the preview ever starts asking for pictures far faster than your screen can show
  them, it notices within two seconds, says so in the Lab's console, and goes back to its plain way of drawing, so it
  keeps running instead of losing its graphics card and restarting.
