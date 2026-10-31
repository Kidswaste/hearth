# Round 93: a speed check across eight rounds, small fixes
*October 2026*

## 📏 Nothing got slower
- We checked whether the last eight updates made Hearth slower. They didn't: starting up, sitting idle, memory,
  opening projects and chats, typing, Settings, the Lab and sync are all as fast as before, and a very long chat now
  opens about six times faster than it did eight updates ago.
- The first time Hearth sets up its "which tools did each AI use" history (a new computer, or a fresh install), it no
  longer freezes for a moment while it reads your recent chats. That work now happens in the background.
- A little less code loads before the first screen appears.

## 🧹 Small fixes
- **"Check this computer" now flags sync problems it used to miss.** If your cloud folder was emptied, or this Hearth
  is too old to read what your other computer synced, the Sync line says "To do" with the right button: "Choose the
  drive…" or "Check for updates…". Before, it said "Ready". When Hearth can't read its own sync records for a moment,
  it says so and waits, without calling it ready.
- Behind the scenes: one sync safety check really checks again (that the sync panel doesn't keep asking for updates
  while it's open), and two other checks now say more when something goes wrong.
