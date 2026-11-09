# Round 153: the Lab in its own lighter window
*November 2026*

You asked for "a lighter window just for the Lab", one that loads only your Three.js scene and keeps running at full
speed even when another app is in front. That window is here.

## ⧉ How to open it

Pick whichever is closest:

- In the Lab: **⋯** (top right of the Lab bar) › **View & help** › **⧉ Open in its own window**.
- Right-click the picture (or its **⋯**) › **View** › **⧉ Open in its own window**.
- A project's menu (its name ▾, a Home card's ⋯, the Desk's ⋯) › **⧉ Open in its own window**: its main scene.
- **Ctrl+;** and type `labwin` (or "open lab window"). `/labwin hide` also hides Hearth.
- **Ctrl+K** › "Lab: ⧉ Open in its own window".

## 🪶 What's in it (and what isn't)

- **In it:** your scene, the timeline, layers and knobs, the Lab's menus, Present, the Stage window, ▶ Play, renders,
  the Lab's keys and the Ctrl+; command bar. Same gold / ember Redux look.
- **Not in it:** the chats list, chats, boards, projects, the usage counters and the other background features. That is
  what makes it lighter: the window doesn't load them at all.
- **It keeps drawing at full speed when another app is in front** (a game, your DAW, a browser). Hearth's own window
  rests when you aren't looking at it; this one doesn't. If Lite mode is on, Lite's 30 frames a second still applies.
- Minimise it and it rests, like the Lab always did.

## 💬 Talking to the AI while it's open

- The AI's chat stays in Hearth's main window. When it changes your scene, the change shows **live in the Lab window**.
- On the right of the Lab window there's a small box where the chat usually sits: type there and press Enter, and it
  goes to that scene's chat in Hearth. You see "working on it…", what it changes, and the first words of its answer.
- **Show the chat in Hearth ↗** (top of that box) brings Hearth's window forward on that chat.

## 🔇 Hearth goes quiet meanwhile

- Hearth's own Lab lets go of the scene (no second copy of the same scene running), and shows a card:
  **"Open in Lab window ↗"** brings the Lab window to the front, **"Bring it back here"** closes it.
- Want Hearth out of the way completely? In the Lab: **⋯ › View & help › Hide Hearth while the Lab window is open**
  (or the **Hide Hearth too** button on the message you get when the window opens). Hearth comes back by itself when
  you close the Lab window.

## ↩ Coming back

- Close the Lab window (its ✕, or **⋯ › View & help › ↩ Back to Hearth**). Hearth's Lab opens on the same scene with
  everything you changed there. Nothing is lost and nothing is saved twice: the Lab window saves the scene the normal
  way, and Hearth never writes its old copy over it.
- Only one scene can be in the Lab window at a time: close it before opening another one there.

## Good to know

- Hearth's main window still has to be running (it holds your chats and the AI); hiding it is fine.
- Honest numbers from the test computer (details: docs/upgrades/labwin153.md): the work around your scene (the Lab's
  own window) is about a quarter to a third lower, and Hearth's main window drops to nothing while it's hidden. The
  scene itself costs the same: it's drawn by your graphics card either way; the win is that nothing else in Hearth
  competes with it and that it keeps full speed behind other apps.
- It uses about **200 MB more memory**, because Hearth's main window stays loaded in the background (it holds your
  chats and the AI). If memory is tight, keep using the Lab inside Hearth.
- It opens in about the same time as the Lab inside Hearth (a fraction of a second more).
