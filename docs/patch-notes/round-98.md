# Round 98: the last sync race closed, project files travel whole
*November 2026*

## 🛟 A save on its way can't land over the other computer's change
- **Fixed**: with sync on, a change from your other computer could be lost on both computers. This happened if it
  arrived at the very moment Hearth was saving the same thing here (a note, a board, a project's worktable…). Your
  save could land a split second later, over what arrived, and the next sync sent that version back. Now your save goes
  first and the next sync merges both, or it waits and is merged with what arrived. Both changes are kept.
- **Fixed**: putting back something from Deleted files could be undone by a save Hearth was already making of the same
  thing. Now that save is merged in.

## 📦 Multi-file models travel whole; a failed import leaves nothing behind
- A 3D model made of several files (a `.gltf` with its `.bin` and texture pictures, or an `.obj` with its `.mtl`) now
  travels whole when you export, import or duplicate a project. Its files keep their folders, so the model still finds
  them. Before, only the main file came along.
- If one of those files is missing on your computer, **What was skipped** now says which one and which model uses it.
- If an import or a copy can't finish (a full disk, a write that fails, or you press **Cancel**), everything it had
  added goes away: the project, its scenes, chats, boards, sequences, pins and trigger bars, and its History. Files it
  had written go to the Trash. Before, some of it stayed behind.
- You can now press **Cancel** while an import is adding its scenes and chats, not just while it unpacks.
- A full disk during an import now stops it with a plain message. Before, the import went on and the file was listed
  as damaged.
