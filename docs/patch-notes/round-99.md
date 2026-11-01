# Round 99: multi-file models in the Lab, no data hidden by a long folder path
*November 2026*

## 🧊 Multi-file 3D models work in the Lab
- A 3D model made of several files now works in the Lab. This means a `.gltf` with its `.bin` and texture pictures (for
  example Blender's "glTF Separate" export), or an `.obj` with its `.mtl`. When you add one, every file it uses is copied
  with it, in the same folders, so it shows with its textures. Before, only the main file came along and the model
  showed grey or not at all.
- You can drop the whole export folder on the Lab, or the model and its files together: you get one model, with its
  textures.
- If a file the model needs isn't there, Hearth says which one, for example "wheels.bin isn't next to car.gltf".
- Removing such a model sends its whole folder to the Trash, unless another scene still uses it.
- With sync on, all of the model's files go to your other computer, including ones your cloud drive keeps online
  only.

## 🛟 A long folder path can't hide your data
- Sync no longer offers "Rename for Windows" for Hearth's own files (projects, boards, Lab presets, chats, settings).
  Their names are how Hearth finds them; renaming one made it seem to vanish. When one of them is too long for your PC,
  the sync panel now says the folder path on the PC is too long, and on the PC it says which folder to move, with a
  button that shows it.
- If an older Hearth on your other computer renames one of Hearth's own files, this computer keeps it under its own name
  and puts it back, so it doesn't disappear on either computer.
