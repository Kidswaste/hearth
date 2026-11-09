# Round 156: Hearth gives memory back
*November 2026*

You asked for Hearth to be lighter. We measured every part of Hearth's memory and fixed the biggest waste, without
removing anything.

## What changed

- **The Lab lets go when you leave it.** After you use the Lab and go back to your chats, its 3D preview used to stay in
  memory for the rest of the day. Now, once the Lab has been out of sight for 5 minutes with nothing playing, it lets go:
  **≈ 1,040 MB → ≈ 790 MB, one process fewer**. Your scene, edits and the song's position are saved first; opening the Lab
  again brings it back in a second or two, and if an AI works on the scene it comes back by itself.
- **It never lets go while** your song plays, you record or render, live sound is on, the Stage window or ▶ Play is open,
  or an AI is working on that scene.
- **Hidden Hearth gets smaller.** When Hearth sits in the tray or is minimised (or hidden while the Lab window is open)
  for 30 seconds, it clears its caches: about **15–20 MB less**. Chats, drafts and replies that are still coming in are
  not touched.
- **The Lab's start-up warm-up lets go sooner**: after 5 minutes unused instead of 15 (about 250 MB freed 10 minutes
  earlier on days you don't open the Lab).
- With just a chat open Hearth stays at **≈ 620 MB in 4 processes**. That is Electron's own minimum (it runs a copy of
  Chrome), so there was nothing safe left to cut there.
