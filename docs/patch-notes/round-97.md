# Round 97: sync can't be undone by a waiting save, Lab work travels with projects
*October 2026*

## 🛟 Four more ways sync could lose work, fixed
- **Fixed**: putting back a big item from Deleted files could be undone a moment later by an open screen still holding
  the older version. Round 96 fixed this for small items. Now big ones (over 1 MB) are safe too.
- **Fixed**: putting back something from Deleted files that wasn't on this computer any more could be overwritten by an
  open screen's next save. The version you put back was then gone from Deleted files too. Now both are kept.
- **Fixed**: with "Send very long chats in pieces" on, a message from your other computer could be lost on both
  computers if it arrived while a reply was still being written in that chat here. Now both messages stay.
- **Fixed**: Kept aside › **Combine…** could lose the combined text if you typed in the same place (a note, a scene)
  while it saved. Now the combined text and what you typed are both kept.
- **Fixed**: "Use the other version", "Keep both", "Merge" and Restore could write over a change saved a split second
  before the click finished. Now that change is merged in. If it keeps changing, Hearth says to try again and nothing
  is replaced.

## 📦 A project's Lab work travels whole
- When you export a project and import it on your other computer, or on a new one, everything you made in the Lab
  comes along: each scene's History, your ⚡ trigger bars and the loop for its song, which scenes you pinned, and the
  sequence each scene opens with. Before, only the scenes, their files and pictures came. The import card now says how
  many versions and trigger setups are coming.
- **Duplicate project** now makes a real copy of your Lab work: History, pins, and its own copy of a song you kept with
  the scene. Changing the trigger bars in the copy no longer changes them in the original.
- Removing a picture, model or sound from a scene now really moves its file to the Trash. Before, the file stayed. A
  file that another scene still uses is kept.
- If something can't come along (a song that wasn't on the computer the project came from, a file that couldn't be
  copied), the "What was skipped" list names it.
