# Round 65: fewer freezes
*October 2026*

## 🧊 Fewer freezes
- **The slowness tracker no longer freezes the window to look at itself.** It used to take an 8-second snapshot of the window by itself, up to 12 times a day — and each snapshot froze the app. It now only does that when you ask.
- **The daily automatic backup no longer freezes the app** for 1–2 seconds while it checks your chats (it got slower as your chats grew). It now works in the background.
- **Dialogs and page switches are lighter.** The Lab, Sidequest Studio and the Sound desk no longer get restyled while they're hidden (about 3× less work each time a dialog opens).
- A second copy of Hearth checking for your real one no longer reads every chat before the window opens.

- **A file held by OneDrive or your antivirus no longer pauses Hearth.** When Windows briefly locks one of Hearth's files, Hearth used to wait for it — up to over half a second, freezing everything. It now waits at most 50 ms and carries on, finishing the save as soon as the file is free (a settings change made at that moment is never lost).
- Token stats after each reply are saved in the background, and the Recycle Bin drive check no longer runs the first time you delete something.

- **Sidequest clicks are quick again.** Starring a place, stamping a visit, switching map layers or opening a place's details no longer rebuilds the whole Paris map — only what changed is redrawn (about 3–4× less work per click, and opening a dialog no longer restyles the page behind it).
