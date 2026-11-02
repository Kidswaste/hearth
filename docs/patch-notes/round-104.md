# Round 104: a file Hearth can't read is never treated as empty, smoother long chats
*November 2026*

## 🛟 18 more places where a locked file could cost you work, fixed
- **Your work stays safe when Windows holds a file for a moment.** Some places in Hearth still read a file that was
  briefly busy (held by an antivirus, OneDrive or the search indexer) as if it were empty, and could then save over it.
  Now they wait a moment and try again, and nothing is written over your files. These cases are fixed:
  - **Sync counts and deletions**: a usage count could be counted twice, or something you deleted on one computer could
    come back.
  - **Sync's own records**: its list of changes could lose earlier entries.
  - **Saves from a window**: saving right after a change arrived from your other computer could undo that change.
  - **Lab scenes**: a scene could leave the save without the usual safety copy.
  - **Updates**: a half-finished update's notes could be cleared before your own edits were put back, and your
    `theme.css` could be replaced.
  - **Keep both**: in sync's kept-aside versions it could quietly become "use the other one".
- **Backups**: a backup is never made without a folder it couldn't open. It waits and tries again.
- **Small things**: paired phones, this copy's browser profile and the first-run shortcuts no longer reset when their
  note is busy at the wrong moment.
- **Behind the scenes**: the data-safety check now looks at each place a file is read, not file by file. It recognizes
  the shape that caused round 103's settings problem, so a new one can't slip in.

## 💬 Smoother very long chats
- **Exporting a very long chat no longer loads it all into memory.** Hearth reads it in pieces as it writes the file.
  The file is the same, and the app no longer pauses for a moment afterwards while it frees the memory.
- **Reading a chat whose AI is missing opens without a stall**, even when its last reply is very long.
- Behind the scenes, Hearth's own speed checks now also catch the pauses memory clean-up causes, and tell a slow
  computer from a slow app when they time your typing.
