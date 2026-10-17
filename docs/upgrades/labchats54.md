# labchats54 (round 54 fix): the Lab's director chats after the update

## What happened
The owner's `config.json` (their agents, settings and look) is a file git tracks, so every update puts it in a named
stash while git merges and puts it back afterwards. For that moment the file on disk is the repo's own: two agents,
no Three Director. Round 53 added a config save to the rail (`Tools.placeNew`, the Creative Playground placed off the
rail once). During the 53 → 54 update the window heard about the repo's file, saved it, and the stash could no longer
come back over it ("your local changes would be overwritten"). The owner's config stayed in the stash
`hearth-update … (764fb08 → f994ef0): your edits`. The Lab lost its docked Three Director, so its chats (Clink's
too) left the Lab and showed under Claude in the chats list. The chat files in `data/chats` were never touched.
Round 52's window had no such save, so the 52 → 53 update went through fine (checked on both versions).

## The fix
1. **The update holds config.json's news** (`main.js`): while it moves files, the window isn't told about the
   repo's file, and a save from the window waits until the owner's file is back. That held save gains anything the
   file has that it lacks, so nothing is dropped.
2. **A stash always comes back** (`updatermain.js` `stashRestore`): a file of the stash written in the meantime goes
   in its own named stash first ("written while the update ran"). Then the owner's edits come back, and config.json
   gains what that write added (`updatesafe-core.js` `bringConfig`: agents join by id, the owner's values win,
   nothing is removed).
3. **The owner's lost config comes back by itself** (`updatermain.bringBack`, run by main.js 4 s after the start):
   each update's "your edits" stash that is still there (successful ones are dropped) is read once, newest first:
   - config.json gains the owner's agents and the parts that are still the repo's own;
   - another file of the stash (theme.css) comes back only when no update changed it since and it wasn't edited here.

   Stashes are never dropped. A config.json that can't be read is never written over.

## Checks
- `node dev/labchats54-test.js` (`unit:labchats54-test`, group `labchats54`) runs on real throwaway git repos: an
  update with the window's save in the middle (a post-merge hook), the owner's state after 53 → 54 plus one more
  update, an unreadable config.json, and `bringConfig`. With round 53's updater files
  (`--from <copy of 764fb08>`) it fails 13 steps: no Three Director, look and theme.css lost, "(see the stash)".
- `node dev/run-checks.js labchats54`: labchats54-test, updater-test, updatesafe-test, updater, lazy, boot-test all
  pass.

## For the patch notes
- **Your Three.js Lab chats are back.** The last update could set your Hearth settings aside, along with the Three
  Director docked in the Lab, so its chats (Clink's too) left the Lab. Your chats were never touched. Hearth now
  brings back what an update set aside, by itself, a moment after it starts: the Three Director with its chats,
  your look and your theme. Updates can't set them aside like that any more.
