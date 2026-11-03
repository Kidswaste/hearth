# Round 108: the Lab with music on fast screens, and a fix
*November 2026*

## 🎵 The Lab rests between frames with music playing
- **Fixed:** on a fast screen (like 240 Hz), a Lab scene with two or more animation loops could run away after round 107 and keep rebuilding the preview. That's fixed.
- **The Lab rests between its frames while your song plays, too.** On a 240 Hz screen the Lab drew at most 60 pictures
  a second, but with a song playing it still woke up 240 times a second. Now it wakes about 140 times, the same as
  without a song. The pictures, the beats, the kicks and everything that follows the music land exactly where they did.
- **Loops snap back a little sooner.** When a loop reaches its end, the Lab jumps back a few milliseconds sooner than
  before (about 5 ms sooner on a 240 Hz screen and 13 ms on a 60 Hz one), so less of the next beat slips in before the
  jump.
- **A fix for scenes with several music reactions on fast screens.** Since the last update, a scene with two or more
  things following the beat (say an "on each beat" and a "on each bar") could make the preview work harder and harder on
  a 240 Hz screen until it had to restart. Fixed.

## 📁 Projects, checked again end to end
- A 3D model made of several files (a .gltf with its .bin and pictures) in a project you import now shows with its
  pictures in the Lab. Before, it stayed blank on the computer that imported it. Projects you already imported are
  fixed too.
- Checked again from start to finish: creating, renaming, moving things in and out, switching, archiving, deleting and
  restoring projects, on one computer and between two. Also checked:
  - export and import with Lab models;
  - duplicating, then deleting the copy;
  - switching right after Hearth starts;
  - a project with a very long chat;
  - choosing between two versions kept by sync.
