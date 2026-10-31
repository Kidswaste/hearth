# Round 95: smoother choices on long chats, Keep PC/Mac fixed, steadier Lab
*October 2026*

## ⚖️ Choosing after a sync clash, without a freeze
- **Choosing between two versions of a very long chat no longer freezes Hearth.** Using the version kept aside, Keep
  both, Keep the other, Merge, or bringing a version back from Deleted files used to hold the whole app for half a
  second to two seconds on a 60 MB chat. Now it happens in the background, and the app keeps responding (about
  0.02 s at most). If the chat changes while the choice is being made, nothing is replaced and Hearth asks you to try
  again.
- **The version you replace is in Deleted files on both computers.** When you choose "Keep the Mac's" on the PC (or
  the other way round), the PC's version now also shows up in Deleted files on the Mac, and you can bring it back from
  either computer. On the computer where you chose, it's listed once.
- **Fixed: on the computer a conflict's other version came from, "Keep PC" could still keep the Mac's version.**
  Round 94's fix for this didn't reach the app. It does now.
- **Each side of a conflict is labelled exactly.** Hearth now records which computer noticed a conflict by its id, not
  just its name. "Keep PC" and "Keep Mac" are always the right way round, even if two computers have the same name or
  you look from a third one. Conflicts from an older version are labelled as before, and both computers can run
  different versions while you update.

## 🧪 Big pictures arrive smoothly in the Lab
- **Smoother**: when a big picture (4K and up) arrives in a Lab scene, the preview no longer sticks for a moment while
  it is prepared. The picture is now turned the right way up in the background, not on the preview's own thread.
- **Behind the scenes**: the Lab's frame-rate check now measures a big picture's arrival from start to finish and counts
  a new layer's one setup moment once instead of twice. It no longer fails at random on a busy computer, and it still
  catches the real problems.
- **Behind the scenes**: the Lab's start-up check runs in about 4 minutes instead of 7. It no longer waits for a quiet
  moment that never comes while a scene is moving. It now checks directly that opening the Lab doesn't read the big
  history and picture files first. When the computer is too busy to judge the Lab's own work fairly, it says so
  instead of failing.
