# Round 113: search every project from Ctrl+K, steadier project switching
*November 2026*

## 🔎 Finding things with thousands of chats
- **Search inside every chat, in every project**: press Ctrl+K (⌘K on the Mac) and type `?` and a few words. The chats
  whose name matches show at once. The messages that match appear right after, each with its project's name.
- **Press Enter on a message** and Hearth opens that project, opens the chat and scrolls to that exact message.
- Accents and capitals don't matter ("cafe" finds Café), the start of a word is enough ("kyo" finds Kyoto), and the
  words can be in any order.
- The chat you obviously mean comes first. Pinned and recent chats rank higher, and a chat no longer shows twice.
- Deleted chats and versions sync kept aside never show. If a chat can't be read at that moment, Hearth tells you
  instead of leaving it out silently.
- Searching no longer slows Hearth down while you type, even with thousands of chats.
- The chats list's search box ignores accents too, and finds chats when you type their words in any order.
- **Find in a chat (Alt+F)** no longer freezes for a second on a very long chat when you search a common word.
- "What did we decide?" answers faster, and **Jump to it** opens the chat's project.

## 📁 Switching projects
- Switching projects with the name ▾ does a little less work: Hearth no longer stops in the middle of the switch to
  check what's on screen, it checks right after. The difference is small (a few hundredths of a second per switch).
- No slowdown in opening a project from Projects: last round's check thought it might have got slower, but measured
  again properly it is the same as before.
