# Round 65: fewer freezes
*October 2026*

## 🧊 Fewer freezes
- **The slowness tracker no longer freezes the window to look at itself.** It used to take an 8-second snapshot of the window by itself, up to 12 times a day — and each snapshot froze the app. It now only does that when you ask.
- **The daily automatic backup no longer freezes the app** for 1–2 seconds while it checks your chats (it got slower as your chats grew). It now works in the background.
- **Dialogs and page switches are lighter.** The Lab, Sidequest Studio and the Sound desk no longer get restyled while they're hidden (about 3× less work each time a dialog opens).
- A second copy of Hearth checking for your real one no longer reads every chat before the window opens.

More is coming: work on Windows file locks (OneDrive / antivirus) that can pause Hearth for a moment, and faster redraws in Sidequest.
