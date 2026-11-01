# Round 103: giant chats and huge folders without a pause, settings never wiped
*November 2026*

## 💬 Giant chats without a freeze
- **Very long chats are smoother.** Opening a chat with thousands of messages, scrolling to its very top, editing an
  older message and getting a new version from your other computer no longer make Hearth stall for a moment. The
  longest pause in each went from about 0.06–0.08 s of work to under 0.045 s. The messages just above the end, or the
  older ones you scroll up to, now come in over a few frames instead of all at once.
- Exporting a very long chat writes it in smaller pieces, so the app stays responsive while it saves.

## 🔄 Sync never pauses the app, and never treats locked settings as empty
- **Faster feel with big sync folders**: with tens of thousands of files, sync no longer freezes Hearth for up to half
  a second at a time during a first sync, when your other computer joins, or when you rename a big folder. In our tests
  with 50,000 files the longest pause sync caused was usually 30–60 milliseconds, never more than about a seventh of a
  second.
- **Behind the scenes**: sync reads the files it needs (stores it brings in, the Lab's scenes it keeps aside, the
  renders list) without making the rest of Hearth wait for the disk.
- **Behind the scenes**: the sync test with very many files now checks each phase on its own (first sync, nothing
  changed, the other computer joining, a folder renamed), and no longer counts its own measuring as Hearth's time.
