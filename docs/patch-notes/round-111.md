# Round 111: signing in always works, a tidier sync
*November 2026*

## 🔑 Signing in, every way
- **Signing in works however it's asked.** Every message Claude Code or Codex gives when you're signed out (expired,
  revoked, "please run /login", "could not be refreshed", "401 Unauthorized"…) now shows a Sign in button. Ordinary
  errors no longer show one by mistake.
- **Sign in tells you what happened.** You see one of three things: a window opened (it may be behind Hearth), the
  window couldn't open (Hearth shows the sign-in link instead), or the engine isn't on this computer (with Install).
- **No window? Sign in from Hearth.** A dialog shows the engine's own sign-in link, with Open in browser and Copy link.
  You sign in in your browser, and Hearth never sees your password.
- **Your message goes out again by itself** once you've signed in, when nothing of the reply had started. Otherwise
  Hearth offers Retry.
- **The doctor and AI setup now notice a signed-out Claude Code.** Before, they couldn't tell.
- **Windows:** the sign-in window opens in front. If the first way fails, Hearth tries a second, and each try is noted
  in the engine log.

## 🔄 Sync tidy-ups
- **Restoring a deleted chat from Deleted files no longer leaves it in Recently deleted.** It comes back on both
  computers and leaves Recently deleted on both. If Recently deleted held a newer copy, that copy is kept in Deleted
  files, so nothing is lost.
- **Deleted files is tidier after you join two computers.** Hearth no longer keeps a "version before the last change"
  of every chat and list when the two are first merged, because the merge already keeps everything from both. Earlier
  versions that hold nothing you don't still have are folded into one line ("Earlier versions already in what you have
  now"). You can still open it and restore any of them.
- **"Waiting" is now decided in one place.** Hearth itself marks a file that's only busy for a moment (in use by
  another program, or a drive that didn't answer). Every place that shows sync's state now agrees that it is waiting,
  not broken.
