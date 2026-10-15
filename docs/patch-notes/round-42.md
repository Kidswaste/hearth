# Round 42: Make a batch, lean handoffs, a fast chats list, Since you were away, files changed elsewhere
*October 2026*

## 🛟 Your Lab scenes are safe (urgent fix)
- **Fixed:** on Windows, if another program (antivirus, OneDrive / iCloud for Windows, the search indexer) held the scenes file at the moment the Lab started, Hearth treated "couldn't read" as "no scenes" and saved a single Basic scene over your list — and sync carried that to the other computer.
- Now a failed read is never "empty": Hearth retries, uses the previous copy, and if it still can't read, says "nothing was changed" with Retry / Recover.
- The Lab saves nothing before it has really read your scenes; a save or a sync that would drop scenes you didn't delete keeps them.
- Automatic copies of your scenes every 10 minutes and before any scene leaves the list (kept on each computer, included in backups).
- **🛟 Recover lost scenes…** (Lab › Sketch ▾, Ctrl/⌘+K, Settings › Backups) finds scenes in those copies, History, sync's set-aside files and your backup zips, and adds back the ones you pick — never removing anything; one Undo.

## ⧉ Make a batch (Lab)
One template (or the scene on screen) → many videos, 0 tokens.
**Find it:** right-click the preview › ✦ More › ⇪ Make › ⧉ Make a batch… (also the toolbar's ⋯ and 📐 My templates).
- Type one title per line, open a CSV (first line names the fields: Title, Song, Logo…), or pick every song or picture in a folder.
- Tick the shapes (16:9, 9:16, 1:1, 4:5), add a 📜 recipe if you like, choose the names ("{title} {format}").
- The first four show as pictures before anything starts. The batch runs in the render queue (pause, cancel, time left); your computer stays awake until it's done; a summary file lists what was made.

## 🤝 Lean handoffs
- Moving a chat to the other AI (Continue with, /handoff, "Ask Astra instead", a second opinion) sends a short brief — goal, decisions, files, the open question, your last exchange word for word — instead of the chat.
- Continue with Astra in a long test chat: about 6k tokens → 1.2k, and the goal is no longer lost.
- One line says what was sent, with **Send the whole chat instead**.

## 💨 A fast chats list
- With 3,000 chats: about 5× faster to redraw; a reply redraws only its own row; chats search costs about a millisecond per letter.
- New: drag a chat onto a 📁 folder (onto its AI's name to take it out); Ctrl/⌘+Z puts it back.
- Renaming (F2) is no longer interrupted by a reply arriving.

## ✦ Since you were away
- After an update that brings several rounds, one calm card replaces the pile of notes: the top changes of every round you missed, grouped (Lab · Chats & AIs · Saving tokens · Mac & Windows · Everywhere · Fixes).
- **Show me** takes you there; **Read the full notes** opens the round-by-round notes. Made on your computer, 0 tokens.

## 📂 Files changed elsewhere
- Save a picture your Lab scene uses in another app → the preview updates in place ("↻ logo.png updated from disk"). A new mix of your song is picked up while it keeps playing; rename or move it and the scene follows.
- Edit a file an AI changed → Hearth says it's no longer safely undoable and asks before undoing.
- Editors' temp files never count; nothing runs while idle.

## Good to know
- Make a batch uses each shape's own framing (no automatic reframe per shape, unlike All formats).
- "Ask Astra instead" and second opinions now send a little more than before (≈ 1.2k tokens) because the brief keeps the goal and decisions the old short excerpt dropped.
- File watching was tested on Linux; the Mac and Windows rules are unit-tested — your computers are the real test.
