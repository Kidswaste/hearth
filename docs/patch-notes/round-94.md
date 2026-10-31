# Round 94: choose between two versions with ease, the Lab loads when needed
*October 2026*

## ⚖️ Compare and choose after a sync clash
- **When both computers change the same thing, you see both and choose.** A new compare view shows the two versions
  side by side, in plain form:
  - for a chat, the messages that differ;
  - for a Lab scene's code or a note, the lines, with the changed ones coloured;
  - for pictures and sounds, both, to look at or play;
  - for settings, "this PC says X, the Mac says Y".
  It works for very long chats too.
- **Keep this one, Keep both, or Combine.** Under each version there's **Keep this one**. **Combine…** puts both
  versions of a text or code in one editor so you can make your own before saving.
- **Every choice has Undo**, and the version you don't keep waits in Deleted files for 30 days.
- **You're told when it happens.** A note appears when something was changed on both computers, and when Hearth kept
  one version and put the other aside. The sidebar shows "◐ 1 to compare" until you look.
- **Fixed: on one of your two computers, "Keep PC" could keep the Mac's version.** Each side is now labelled the way
  the computer you're on sees it.
- **Fixed: Merge and Keep both could hide one version.** Both now wait in Deleted files.
- **Lab triggers changed on both computers at once** now come with a note saying the other setup was saved as a
  trigger preset.
- **Deleted files** names things plainly and no longer says "your other computer deleted it" about a version you
  replaced yourself.

## 🧪 The Lab loads when you're likely to use it
- Hearth starts lighter. The Lab's code no longer loads at every start: when you don't use the Lab that day, the first
  half-minute after opening Hearth uses about a sixth less of your computer.
- Hearth learns how you use the Lab. If you open it most days, it gets it ready a few seconds after you start; if you
  use it now and then, it gets it ready later while you're not doing anything; if you closed Hearth in the Lab, it's
  ready right away as before.
- Just pointing at the Lab's button (or at "Apply to scene" in a chat, or seeing the Lab come up in Ctrl/⌘+K) gets it
  ready, so it opens as fast as before.
- If you haven't used the Lab for a couple of weeks, its first opening can take a moment longer (about a fifth of a
  second) while it loads.
- Fixed: a rare hiccup when the Lab's timeline or preview was resized ("ResizeObserver loop").
