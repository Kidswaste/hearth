# Round 92: the AI and the Lab work together, a clearer sync panel, lighter search
*October 2026*

## 🧪 The AI chat and the Lab work together
- **Apply the AI's code to your scene in one click.** When Claude or Astra answers with a whole layer of code, the
  block has a **▶ Apply to scene** button: replace the selected layer, another layer, or add it as a new one. The
  scene updates right away, the chat tells you if it runs or what error it hit, and **↶ Undo** puts it back.
- **Tell the AI what happened, in one click.** After applying, "Tell Claude what happened" (or "Send the error to
  Claude") sends a short note with the result. Nothing is sent unless you click.
- **Your typing is safe while the AI works.** If you're typing in a layer while the AI edits another one, your editor
  stays where it is and your keys stay in your layer. Your cursor no longer jumps when it edits the layer you're in,
  and the AI can't replace a whole layer you've just typed in without reading it first.
- **Chats you start from the Lab know your scene.** "Ask Claude about this layer" and "Ask director to fix" open a
  chat that works on that scene (not another one), with a short line naming the scene, its layers and what's
  selected.
- **Clearer scene errors in the chat.** A syntax error now says so, with the error itself shown.

## 🔄 A sync panel that says what's wrong and how to fix it
- **The sync panel now says what's going on, and what to do.** When sync stops by itself, the panel says why in one
  sentence and puts the fix right there:
  - **Start the cloud copy again from here** or **Pick the folder again…** when the cloud folder moved or was emptied.
  - **Check for updates…** when this Hearth is too old.
  - **Resume sync** when it's paused.
  - **Sync big videos** when big videos stay on one computer.
- **The little sync label in the sidebar matches the panel.** It shows "⚠ Folder", "⚠ Update", "⚠ Problem" or
  "⚠ Review" instead of "Offline" or "Look" when something needs you.
- **"Everything is synced" now means everything.** If a file can't sync or a conflict is waiting, the tooltip,
  Settings and the Sync now note say "Synced, but 2 files can't sync".
- **A computer you haven't used for a while** shows up in the panel with a **Your computers…** button, so you can
  forget it if it's gone for good.
- **Deleted files** shows names and "deleted yesterday", not folder paths.
- **The technical details** (folders, codes) are folded away under **Details**, with a **Copy details for Claude**
  button for when something needs looking at.

## 🔎 Lighter search in big projects
- Find in this project no longer holds a very long chat in memory. Hearth's background helper uses
  about 70 MB less after you search a project that has one, and finds the same things in the same
  order.
- Searching a project is a little quicker once you've typed the first words.
- If Hearth can't read a long chat at the moment you search, the box now says so, instead of
  suggesting nothing matched.
- Tips that wait for a dialog, the sync panel or a card to close now show right when you close it,
  and Hearth wakes up far less often while they wait.
