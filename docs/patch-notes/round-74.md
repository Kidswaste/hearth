# Round 74: faster AI work in the Lab, a calmer preview, tougher sync, steadier projects
*October 2026*

## 🧰 Faster AI work in the Lab
- **AI changes in the Lab answer faster**: an edit no longer waits several seconds for a small picture nobody asked
  for. If the picture isn't ready quickly, the AI is told and can ask for one.
- **Chats working on a scene you're not looking at no longer stall** for about 3 seconds after each edit: the chat
  list's preview picture is now taken when the AI pauses.
- **Simple changes are instant**: opacity, visibility, keyframes and removing a layer answer right away.
- **A whole AI reply in the Lab took 15–40 % less time** in our test (34–39 s down to 23–29 s; the most in the background), and most single
  calls answer in about 10–20 ms. What's left is the 3D preview itself drawing the change.
- **Pictures cost less**: checking whether a picture changed and sending it no longer redo work the preview already did.
- **Nothing changes in what the AI can do**: same results on screen and in the background, one undo per reply, and a
  failed change is still put back whole.

## 🎮 A lighter Lab preview
- The Lab preview now rests when nothing moves. A still scene used to redraw about three times a second, and three
  more times whenever anything happened in the Lab. Now it redraws about once every four seconds, so your graphics
  card can rest while you think.
- Moving your mouse over a still scene no longer makes it redraw, unless the mouse actually moves something (an
  orbit, a hover effect).
- Fixed a small bug that made still scenes think they had changed every few seconds.
- Shadows are redrawn only when something that casts them, or a light, moves. Turning the camera around a shadowed
  scene costs less.
- Big crowds made of copies (instanced meshes) draw only the copies you can see, or whose shadow you can see, while
  the preview is struggling. The picture stays exactly the same.
- With Quality: auto on, the preview no longer drops its resolution in the middle of a slider drag. It decides once
  you let go.
- In the frame bar, Why? now suggests a lighter far shape for big, detailed crowds.

## ☁ Sync that handles real-world Windows and Mac trouble
- Sync now copes with what real computers do: a file another program is using (the Sound desk playing a WAV, your
  cloud drive, an antivirus), a read-only file, or a full disk no longer shows up as a scary error and is never left
  half-copied. Hearth tries again by itself.
- Click the sync indicator at the bottom of the left rail: when something can't sync it says "⚠ 1 to fix", and the
  panel lists the file by name, says why in plain words, and gives you the button that fixes it.
- Names your PC can't use (a Mac capture called "Capture 10:32.png", a name ending in a dot, "CON.txt", a very long
  folder path) now get a "Rename for Windows" button on the Mac. Links to the file in your chats and scenes follow the
  new name. Before, those files just never reached the PC.
- If your cloud folder is moved, renamed, unplugged or emptied by the cloud app starting over, sync pauses and says so.
  It never treats that as "you deleted everything".
- If your computer goes to sleep in the middle of syncing, nothing that was still arriving gets mistaken for finished,
  and a chat you deleted stays deleted.
- Keys, tokens and passwords (key files in a project, API keys in your settings) never sync anymore. If an older
  version had already put one in the cloud copy, the panel offers "Remove from the cloud".
- When your two computers run different Hearth versions, the panel tells you to update the older one, and an older
  Hearth won't overwrite what a newer one saved.
- Big folders sync much faster: 50,000 small files went up in about 1 minute instead of nearly 3, without the app
  stuttering.
- Install this update on both computers.

## 📁 Projects
- **Coming back to a project’s Desk is quicker.** It used to be rebuilt every time you came back
  from the Scene or another tab; now it stays as you left it (scroll, open shelves, searches), and still updates when
  something in the project changes.
- **Project files with hundreds of items stay light.** After "Show more", only the rows on screen are drawn and only
  their pictures are loaded; the rest come as you scroll.
- **Opening a project from Projects starts the Lab's preview the moment you press the card**, while Hearth gets the
  chat and tools ready. Nothing stays loaded behind the Projects page: if you don't open it, it's let go after a few
  seconds.
- **New option: Keep the Lab ready behind Projects** (Projects › ⋯, or /keep-lab-ready on). Opening a project from
  Projects is then as quick as switching projects. It's off by default because it uses more memory, and it lets go
  as soon as you leave Projects for anything else, or after 10 minutes.
- Behind the scenes: three project checks that only ran when started by hand now run with the others, and the
  project speed check measures the files list in frames and no longer shows a false failure.

