# Round 124: the chats search is back
*November 2026*

## 🔎 Searching your chats
- Since round 116 the search box at the top of the chats list was squeezed to a sliver by the project bar, so the
  list couldn't be searched. The project bar now sits on its own line and the search box is full width again.
- **Search inside messages** is back under the search box: it opens Ctrl/⌘+K's message search with your words,
  across every project.

## 💬 New chats
- A new chat's row no longer disappears from the list for about a second after you send its first message: it is in
  its project from the moment it's saved.

## 🎛 The Lab keeps drawing
- The Lab's guard against runaway animation loops (round 109) could mistake two frames with the same timestamp for a
  runaway and stop a hidden page's own drawing for good: precomps came out black, gallery picks and thumbnails never
  appeared, and the jam's preview sat at 0 fps. A frame the guard holds back now comes back once on the next frame,
  so a page can't freeze that way; a real runaway is still stopped.
