# Round 118: two computers in step, a quicker start, an up-to-date guide for the AIs
*November 2026*

## 📁 Chats in projects, on both computers
- Every chat stays in exactly one project even while one computer still runs the older Hearth: a chat the older
  version puts in a second project, takes out of its project, or makes without a project ends up in one place, the
  same on both computers, and never goes missing.
- Fixed: when the Mac's clock was behind, a chat you had moved could jump back to its old project.
- Deleting a project moves its chats to "Earlier chats" at once (before, they were out of the list for 3 minutes).
  The project itself still waits in Recently deleted.
- Bringing back "Earlier chats" from Recently deleted no longer puts chats in two projects.
- Past chats you import go straight into the project you have open (or "Earlier chats" if none is open).
- If your projects can't be read for a moment, Hearth waits and tries again: it never treats them as empty.

## ⚡ A quicker start
- Hearth loads about 5 % less code at start (1,679 → 1,597 KB) and is ready to use about 0.1 s sooner. The notes
  panel, the memory editor and the Lab's jam now load the first time you use them.

## 🧭 Hearth's own guide for its AIs
- When you give a chat access to Hearth's own folder, Claude and Astra now read the same, up-to-date guide to how
  Hearth is built (no more mentions of removed parts), and the Three Director can open it on demand.
