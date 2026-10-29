# Round 85: projects with giant chats, a steady command list
*October 2026*

## 📦 Projects with giant chats stay smooth
- Exporting a project that holds a very long chat (thousands of messages) no longer freezes Hearth. The work happens
  in the background, the app keeps answering, and it's about twice as fast. The file it makes is exactly the same as
  before.
- Importing such a project file, and **⧉ Duplicate project** on one, no longer freeze the app for seconds either. The
  long chat is added in the background and shows in your chats list right away.
- If a chat in the project can't be read at that moment, the export or copy stops and writes nothing (try again a
  moment later). Passwords and API keys still never go into a project file.
- **Earlier versions › Preview** of a very long chat opens in under a second instead of freezing the app for a couple
  of seconds. It shows the newest 300 messages; **Show 300 earlier** loads the ones before.

## 🧭 A steady command list
- Behind the scenes: the help, the command list (Ctrl/⌘+K) and the keyboard-shortcuts sheet no longer lose entries or
their descriptions. The list they are built from now comes out the same every time.
- Fixed: /context showed no description in Ctrl/⌘+K for the first few seconds after a slow start.
