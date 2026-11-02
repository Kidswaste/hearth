# Round 105: every test passes, three hidden bugs fixed
*November 2026*

## 🧰 Every test passes, and every release runs them all
- **Updates**: when Hearth's folder sits inside another git project that has no saved version yet, the update button
  says so again, instead of offering to "connect" the wrong folder (since round 78).
- **Updates, more careful with busy files**: if a note Hearth keeps about updates is briefly locked by another
  program, Hearth now waits for the next start before tidying your settings or bringing back edits it kept for you,
  instead of guessing. Nothing of yours is overwritten.
- **Lab history on two computers**: if one computer tidied a scene's history (around midnight) while you kept working
  on the same scene on the other, the other computer's versions from those minutes could disappear from the history
  after syncing. They're kept now.
- **Songs analysed faster**: a song's features for the Lab are worked out about a fifth faster, with exactly the same
  results.
- **Behind the scenes**: every test Hearth has now runs before a release, and the speed tests know when the computer is
  just busy.

## 🔄 Renames keep their history; web-page export of long chats
- **Sync counts stay right after a file is renamed.** If you renamed or moved one of Hearth's synced files while
  Windows was holding sync's own note about it for a moment, the next sync could add both computers' usage counts
  together (13 instead of 8). Something you deleted on one computer could also come back. Sync now carries that note
  along with the file. If the note is truly missing, counts keep the higher number instead of adding twice.
- **Exporting a very long chat as a web page is lighter.** `/export html` now reads a very long chat in pieces, as the
  other formats already did. It doesn't load the whole chat into the window first. Memory during the export peaks about
  100 MB lower, and the short pauses afterwards are fewer and shorter. The file is exactly the same as before. If a part
  can't be read, nothing is saved, so you never get a half page.
