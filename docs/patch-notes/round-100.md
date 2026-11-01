# Round 100: smooth model textures, games and pages carry whole models, a speed check
*November 2026*

## 🧊 Model textures load smoothly and update live
- 3D models with big textures no longer make the Lab preview stutter when they appear. A model's texture pictures are
  now prepared in the background and sent to the graphics card a little at a time between frames. Meanwhile a small
  version shows, so the model has its colours right away. This works for `.gltf`, `.glb` and `.obj` models, and for
  models your own scene code loads.
- When you save a model's texture again (for example in Photoshop), the Lab shows the new one right away, without
  reopening the scene. Saving its other files again (`.bin`, `.mtl`) reloads the model by itself.
- ▶ Play and published pages now work with models made of several files: every file the model uses goes with it.
  Published pages with a 3D model layer also load properly now, including a single `.glb`. Before, they showed
  "didn't load".

## 📏 Six rounds of safety work, no slowdown
- We checked whether the last six updates made Hearth slower. They didn't. Starting up, sitting idle, memory, opening
  projects and chats, typing, sending and saving messages, Settings, the Lab and sync (also with 50,000 files) are as
  fast as before. Starting up uses about a fifth less computer power than six updates ago.
- If you open the Lab for the first time in two weeks with a keyboard shortcut, it can take about a tenth of a second
  longer to appear. That's the other side of Hearth no longer loading the Lab at every start. Pointing at the Lab's
  button first hides it.
- The chats list redraws about a fifth faster when you have many chats in projects (after each message, and when you
  switch chats).
