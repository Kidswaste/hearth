# Round 75: earlier versions, moving projects, a lighter Lab and sync, and real bug fixes
*October 2026*

## 🕘 Earlier versions
- **🕘 Earlier versions**: right-click a chat (or a project, or a Lab scene card) and pick **Earlier versions…** to see
  every older version Hearth still has, from both computers, with when, which computer and what changed ("12 messages
  fewer", "notes: 3 lines changed").
- **Preview** shows an old version without changing anything; **Restore** brings it back and keeps the one you had, so
  the **Undo** on the notification always works. The restore reaches your other computer like any edit.
- In the sync panel (click the sync word at the bottom of the left rail), **Earlier versions…** lets you pick any chat,
  project, scene, board or your settings.
- **Deleted things** (a tab there) lists deleted chats, projects, Lab scenes and boards; one click on **Restore** puts
  one back as it was.
- Boards: Board ▾ › More › Earlier versions…. Ctrl/⌘+K "Earlier versions…" and "Deleted things…" work too.

## 📦 Export, import and duplicate projects
- **Export a project as one file**: right-click a project (or its ⋯) › **⇪ Export project…**. Scenes, boards and notes always go; tick whether its chats and its files and captures go too (you see how big each is). A progress bar with Cancel shows while it saves.
- **Import a project**: Projects › ⋯ › **⇩ Import project…**, or just drop a `.hearthproject` file on the Projects page. A card shows what it will add before anything happens.
- Imports always come in as a **new project**: nothing you already have is changed or replaced, and chats are linked back to their scenes and boards.
- If something couldn't come along (a file that wasn't on the other computer, a damaged file, an AI that isn't set up here), the toast says so; click **What was skipped** for the list.
- **Duplicate a project**: right-click a project › **⧉ Duplicate project** makes “… copy” with its own copies of the scenes, boards and chats, so you can try a different direction safely.
- Exported files never contain passwords, API keys or sign-ins.
- A file made by a newer Hearth asks you to update first (⬆ Update) instead of importing half of it.

## 🎮 Lab memory and loading
- **Switching between projects no longer makes the Lab heavier over time.** After 30 switches between big scenes,
  the preview's memory stays where it was after the first few; it used to grow with every switch.
- **Scenes you've opened before come back faster.** Their pictures, 3D models, skies and videos stay ready in the
  preview, so going back to a project doesn't load and unpack them all again.
- **A thin line at the top of the preview shows a scene's files loading** when it takes a moment, and the project's
  loading card counts them.
- **Sound made with three.js in a scene keeps working** after you switch scenes or projects (it went silent after the
  first switch).
- **A scene you leave lets go of its graphics memory and stops its sounds right away.**
- Behind the scenes: a new check switches projects 30 times with heavy scenes and fails if anything keeps growing.

## ☁ Lighter sync on big folders
- Syncing with tens of thousands of files no longer makes Hearth stutter: a routine sync check used to freeze the app
  for up to a fifth of a second, now it is under a twentieth.
- Hearth keeps its record of what is synced in small pieces and only saves the pieces that changed, instead of
  rewriting one big file each time.
- If your computer crashes or loses power in the middle of a sync, that record is never damaged: Hearth picks up from
  the last good save. We tested a crash at every single step of a save.
- Your existing sync record is converted by itself the first time; the old file is kept beside it as a backup.
- Big first syncs are a little faster: Hearth now checks several files at once.
- Button-usage counting no longer costs the app anything noticeable each minute while sync is on.
- Install this update on both computers as usual; nothing to set up.

## 🐞 Fixes found by the test sweep

- Ctrl/⌘+Shift+R no longer reloads all of Hearth while the Lab is open (it shows a note instead, as intended).
- /audio in the Lab tells you what the Lab hears again (and /audio names lists the sound features); /audio doctor
  still checks your music setup.
- ↶ in the director's dock undoes the AI's code edit even after you added a look or moved sliders, without wiping
  what you did since.
- An AI's progress bar shows on its icon above the chat again.
- On the Mac: Quick idea's key reads ⌃⌥I, and the FL Studio guide says ⌘S.
- Preparing a project for offline use can take the scene libraries from a local three.js copy.

