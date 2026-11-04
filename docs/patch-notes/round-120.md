# Round 120: a fast chats list again, and a check for Astra
*November 2026*

## 📁 The chats list is fast again
- With thousands of chats, the chats list took about half a second to redraw each time you switched project, opened
  a chat or a reply arrived (a slip from round 116). It now takes about 2 thousandths of a second.
- The list now really shows only the open project's chats: the old project groups that could still appear in it,
  and "Group by project" in its ⏷ menu, are gone as planned.
- Opening a chat in another project from Ctrl/⌘+K always shows it in the list now.

## ✧ Check Astra works like Claude
- In the AI doctor, click **Check Astra works like Claude** (also in Ctrl/⌘+K, or `/check-astra`). After you confirm,
  it sends Astra a few short messages (a few cents at most) and shows ✓ or ✗ for each: Astra is ready, Hearth's
  instructions reach it, its own edit tool works, and your data folder's lock holds.
- It only works in temporary folders it removes afterwards, never in your projects or your data.
- **Copy report for Claude** puts the result on your clipboard: paste it in a chat with us if anything shows ✗.
