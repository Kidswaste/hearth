# Round 125: "Which project?" only when you ask
*November 2026*

## 📁 New chats
- The "Which project is this chat for?" window now opens only when you start a new chat yourself with no project open
  (＋ New chat, an AI's ＋, Ctrl/⌘+N, the tray, Ctrl/⌘+K, the rail, `/new` with nothing after it).
- A chat Hearth starts on its own (from the Lab, a linked chat, the send preview, the blank chat after you delete the
  open one) never pops that window up any more, even right after a click: it goes to the scene's project or the open
  one, else to "Earlier chats" with a short note. Before, it could appear out of nowhere and take your keyboard.

## 🧪 Behind the scenes
- 88 more app checks were run again one by one: 13 that only repeated what newer checks measure were deleted, and 4
  that still assumed chats outside projects were fixed. Two real problems they found are being fixed next: clicking a
  scene on a project's Desk can leave you on the Desk, and a shader that doesn't compile isn't always reported in the
  Lab's chat.
