# Round 32: Check this AI, cheaper long chats, free Lab variations, Windows fixes
*October 2026*

## ✅ Check this AI
One button runs a short real test of an AI and shows a checklist: found · up to date · signed in · answers · reads its folder · writes there · runs a command.
**Find it:** ⋯ AI setup › What it can use › Check this AI. A chat's "couldn't run a command" note has the button too.
- Each failing line has its own fix: Install / Update / Sign in, Allow edits, Allow commands, and for Astra on Windows "Run without its sandbox…".
- Uses a few tokens, only when you press it. Its test file goes to the Trash afterwards.
- The last result stays on the row ("7 of 7 ok · 14:02").

## 🪙 Long chats cost less
- The AI's prompt cache now keeps hitting, so a long chat is re-read at full price far less often: about ¾ fewer full re-reads in a 20-message chat.
- Remembering a new fact or sending a picture no longer restarts the chat at full price.
- See the savings: hover a reply's ⚡, the meter, or ⋯ AI setup › Spending.
- Changing personality, instructions or tools mid-chat shows one calm line: the next message re-reads the chat once.

## 🎲 Lab variations (free)
Six takes on your scene, side by side, made on your computer with 0 tokens: new colors, livelier or calmer, another angle, a new look.
**Find it:** right-click the preview › ✦ More › ✨ Look & motion › 🎲 Variations, the Lab toolbar's ⋯, or the ◎ mission "Quick variations (free)".
- Hover to see one play; click to use it (one Undo puts it back).
- **More like this** makes a closer set; **Keep: Colors / Motion / Camera / Look** locks those.

## 🪟 Windows
- Claude Code or Codex installed with npm is now found and started by itself — no path to set.
- Settings › Engines accepts a pasted path with quotes, `%APPDATA%`, or just the folder.
- Deletes stay recoverable: files on a network share or USB stick (no Recycle Bin) are left in place, and the chat says why.
- Windows errors read as one plain sentence with the button that fixes it — no stack traces.
- Folder checks understand every Windows way of writing a path (two that slipped through now ask first).
- Chrome Beta / Dev / Canary work for Google sign-in.

## ⚡ Smoother
- Dragging a gap in the grid view does about 9× less work.
- A playing Lab scene makes about 80% fewer page updates; a chat streaming beside the Lab about ⅔ less.
- Chrome views' loading bar no longer repaints the whole window.
- Nothing looks different — the app just does less behind the scenes.

## Good to know
- Everything Windows was tested on a simulated PC: your next start is the real test. Try **Check this AI** on Astra and on Claude.
- Personality and instructions now sit after the tool guides in the AI's setup text (this is what keeps the cache hitting).
- Variations doesn't change values a scene only reads at start (like particle counts).
