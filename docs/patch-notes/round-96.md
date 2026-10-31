# Round 96: two sync data-loss fixes, more room at startup
*October 2026*

## 🛟 Two ways sync could lose work, fixed
- **Fixed**: if you edited a project's notes (or a board, a Lab scene, any synced data) more than once while your
  cloud drive was offline, and changed it on your other computer meanwhile, your first edit could be lost on both
  computers when the drive came back. Now both computers' changes are kept.
- **Fixed**: "Use … instead" and Restore from Deleted files could be undone a moment later by an open screen still
  holding the older version, for example the Lab's presets with a change waiting to be saved. The version you put back
  now stays, and the open screen's own change is kept with it.
- **Behind the scenes**: the sync choices check no longer fails on a busy computer when sync happens to run between its
  two edits. The Lab's shader check counts a new layer's one setup moment once instead of twice, and still catches
  shaders made in the middle of a scene.

## 🚀 More room at startup
- Hearth's first screen is lighter again: about 60 KB less code is read before the window shows.
- The director's strip beside the Lab, the progress bars, "Let Astra decide" and the Lab's right-click menus now load
  a moment after Hearth opens instead of before it.
- Nothing looks or works differently: every button, key and command works from the first moment, as before.
- This makes room for the next features to start fast too.
