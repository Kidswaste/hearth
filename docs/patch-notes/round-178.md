# Round 178: a heavy scene no longer slows Hearth down
*November 2026*

## 🎬 Scenes now run in their own player
- On Windows, the Lab's live scene now runs in its own small app, laid exactly over the preview. It has its own share of
  the graphics card, so a heavy scene can't make the rest of Hearth lag any more. Measured with a deliberately heavy
  scene: Hearth's own window stayed at 210 frames a second with the scene in the player, against 26 with the same scene
  inside Hearth's window.
- It looks and works the same: code edits, sliders, layers, the song, the camera, recording, the Stage window, and
  what Claude and Astra see of your scene. It follows Hearth's 🔊 volume.
- If the player can't start, stops or doesn't draw, Hearth puts the scene back inside its own window by itself and
  tells you so, with a **Try the player again** button.
- You can switch it yourself: **PLAYER** on the Lab's dock, SEPARATE (the new way) or IN-APP (inside Hearth's window,
  as before).
- The black picture the first version of this player showed is fixed: its window was being shown the wrong way.

## What waits under the player for now
- The size pill, guides and the scene editor's outlines are drawn by Hearth, so they sit under the player's window.
  Switch PLAYER to IN-APP when you need them.
- A right-click or a file dropped on the picture doesn't reach the Lab while the player is on, and a scene that
  listens to the keyboard gets no keys in the preview (▶ Play still does).
- When a menu opens over the picture, the player steps aside and a still of the scene shows until the menu closes.
- Renders, the second Lab window and scenes that chats run in the background still draw inside Hearth.
- The Mac keeps the old way until the player has been tried on one.
