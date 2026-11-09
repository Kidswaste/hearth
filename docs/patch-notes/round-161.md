# Round 161: fixes, and a lighter Hearth beside the Lab window
*November 2026*

## What was fixed

- **Dropping a 3D model on a project's chat works again.** A .glb (or any video, sound or model) dropped on a project's
  chat goes into the open scene's references again, with a note telling the AI its name, as in a director's chat. For a
  while it was only kept as a copy for later.
- **The Lab's ⋯ menu is back to its tidy size.** **⚡ Lite mode** moved into **⋯ › View & help**, at the top. It is
  still in the rail's ⋯, in Settings, on Ctrl/⌘+Alt+L and in the command bar, and the LITE tag beside ⋯ turns it off in
  one click.
- **Settings is tidy again**: the Lite mode tick box moved to the top of **Settings › Look & size › More looks and
  tweaks**, next to motion and glow; that line says "⚡ Lite mode on" while it is.
- **Lite mode is on from the very first picture.** After a restart with Lite mode on, the first frames could still show
  the usual animations for a moment; now Lite is in place before anything is drawn.

## What got lighter

- **While a scene is open in the Lab window, Hearth's own window lets go of its Lab entirely**: the editor, its
  scenes, its preview and everything it keeps in memory. Your chats, drafts, replies that are still being written and
  the AI's work on the scene carry on as before. When you close the Lab window, Hearth's Lab comes back on that scene,
  with everything you changed there.
- With the Lab window open, Hearth uses **about 35 MB less** on our test machine (1,277 → 1,242 MB in all; Hearth's own
  window 210 → 203 MB, the graphics process 265 → 234 MB). The Lab window now costs about **188 MB** on top of the Lab
  in Hearth's window, down from 223 MB: most of what is left is the Lab window itself.
