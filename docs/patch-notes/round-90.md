# Round 90: your computers, a smoother Lab, two real fixes
*October 2026*

## 💻 Your computers
- **New: Settings › This computer & sync › Your computers.** It lists every computer that syncs with this one: its
  name, Mac or Windows, when it was last seen, its Hearth version, and whether it can receive very long chats in
  pieces.
- **Forget a computer you don't use any more** (an old laptop, a computer you reinstalled). It shows only for a
  computer that hasn't synced for over a week, and never for the one you're on. Hearth asks first.
  - Nothing of its data is deleted.
  - Your other computers just stop waiting for it. For example, "Send very long chats in pieces" can switch on again
    if that old computer was the only one holding it back.
  - If it ever comes back, it simply joins again, and nothing it has is lost.
- **See how much room very long chats' pieces take,** and free the old ones with one click: **"Free up …: remove
  kept-aside pieces older than 7 days"**.
  - They go to your computer's Trash / Recycle Bin, not deleted for good.
  - Pieces a chat still needs are never touched. If Hearth can't read one of the chats' lists right then, it removes
    nothing.
  - Hearth doesn't set a limit by itself: if you'd like an automatic one, just ask.

## 🎬 No hitch when something new appears in the Lab
- **No more stutter when something new appears in a playing scene.** A new object, a new material, a new light or a
  glass object is now prepared in the moment between two frames, and shows as soon as it's ready. The rest of the
  picture keeps moving the whole time.
- **Glass is ready from the start.** Scenes with glass or see-through materials now prepare everything glass needs
  before they start, so the first glass frame doesn't stick.
- **Big pictures arrive in pieces.** A large image (4K and up) is sent to the graphics card a strip at a time between
  frames, and shows once it's all there, so it no longer causes one long jolt.

## 🧰 Two real fixes found by steadier checks
- **Fixed**: opening a project chat that has its own Lab scene no longer marks the scene you left as just edited.
  Before, it saved every Lab scene again and sent them all to your other computer.
- **Fixed**: Find in this project no longer redraws the same results a moment after they appear. A result you were
  about to click, or had picked with the arrow keys, stays put.
- **Behind the scenes**: the keyboard check judges the Lab's console key by whether the console shows, so a busy
  computer no longer fails it.
