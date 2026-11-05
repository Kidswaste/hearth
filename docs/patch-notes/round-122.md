# Round 122: safer updates, quicker sending
*November 2026*

## 🔄 Updates keep your changes safe
- If an AI changed Hearth's own code on your computer, an update now keeps those changes safe even when the update
  removes or rewrites the same files: your versions are copied to a **kept-from-updates** folder (with a short note
  of what's inside), and the update goes ahead cleanly.
- Before an update, its window lists the files you changed that the update will remove.
- The first time this version starts, it also repairs what an older update could have left behind (a half-updated
  file, or a removed file still lying around), keeps your version in **kept-from-updates**, and tells you once.
- As always, your data folder is never touched by an update.

## ✉️ Quicker sending
- Hearth no longer rebuilds the AI's instructions from scratch for every message (they come out exactly the same).
- Claude and Astra are now started by a small helper program, so pressing Send no longer makes Hearth pause while
  the AI starts. If the helper ever fails, Hearth goes back to the old way by itself.
