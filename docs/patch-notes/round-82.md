# Round 82: giant chats stay smooth everywhere
*October 2026*

## 💬 Giant chats stay smooth everywhere
- Very long chats (thousands of messages) no longer freeze Hearth. Opening one, sending a message in it, or reacting to
  an old message happens without the app stalling: only what changed is saved.
- Sync handles very long chats much faster and in the background: a new message on each computer no longer means
  re-processing the whole chat, and nothing heavy runs on the part of Hearth that answers your clicks.
- Earlier versions of a very long chat open quickly, without a pause.
- Find in this project, search and "what did we decide" stay smooth while they read a very long chat.
- Handing a long chat over to the other AI takes about a second instead of half a minute; sending in a long chat no
  longer hitches while Hearth prepares the lighter history.

## 📏 A speed guard that holds up on a busy machine
- Behind the scenes: the performance guard that watches Hearth's speed no longer cries wolf when the test computer is
  busy. It now measures how much work Hearth does, not only how long things take. It checks how busy the computer is
  before judging, and says "can't tell right now" instead of raising a false alarm. For releases it races the new
  version against the previous one, side by side in the same minutes. It still caught a real slowdown on purpose (a
  start that re-reads every chat), so real slowdowns are still found before they reach you.

