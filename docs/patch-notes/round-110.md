# Round 110: sync walked by clicks, live sound and footage on fast screens, sign-in fixed
*November 2026*

## 🔑 Signing in again
- When Claude's sign-in in Hearth expires ("OAuth session expired and could not be refreshed"), the chat now says Claude isn't signed in and shows a Sign in button.
- On Windows, the sign-in window now always opens in front. If Hearth can't open it, the chat says so instead of doing nothing.

## 🔄 Sync, checked by clicks
- **A file that's busy for a moment no longer looks like a problem.** When another program (OneDrive, an antivirus,
  a player) holds a file, the sync label now says "↻ 1 waiting" and "Hearth tries again by itself", instead of
  "⚠ 1 to fix". It still has **Try again now**, and it goes back to ✓ by itself once the file is free.
- **Fixed: "✓ Synced" while some of Hearth's own files couldn't reach your PC.** When the folder path on the PC is too
  long, the label now says "⚠ 3 to fix" and the panel says which folder to move, with a button that shows it.
- **Finding a deleted chat is easier.** A chat you delete on either computer is in **Recently deleted** on both.
  Deleted files now says so, with a **Recently deleted…** button. Deleted chats are named there (they said "A chat").
  Restoring one brings it back on both computers and takes it out of Recently deleted.
- **"Pick the folder again…" with your drive unplugged** now says the drive isn't connected right now and that sync
  catches up when it's back. It no longer says "No cloud drive found".
- **Disk full:** Free up space now also says how else to make room (empty the Recycle Bin, move big files) when there's
  nothing Hearth can free.
- **A file saved by a newer Hearth on your other computer** now comes with a **Check for updates…** button.
- **"Send very long chats in pieces"** now names the computer it's waiting for, and shows "On: in use." right after you
  turn it on.
- **Fixed: in Settings › Your computers, the "Forget this computer?" question could vanish** right after you clicked.
- Small wording fixes: the list of many deletions shows names, not folder paths; a sync error's note reads as a normal
  sentence.

## 🎧 The Lab with live sound and footage
- **The Lab rests between frames with live sound and with video too.** On a 240 Hz screen the Lab drew at most 60
  pictures a second, but with live sound (🎧 Live) or a video playing it still woke up 240 times a second. Now it wakes
  a bit more than half as often, the same as with a song, and your visuals react to the sound exactly as fast as before.
- **Video cuts stay exact on a busy computer.** The Lab now times each cut in your footage from the video's own clock,
  so it jumps on time instead of letting a bit of the part you cut play (and be heard) when the computer is busy. Frozen
  frames end on time too.
- **Two video fixes.** A frame you cut could slip into your scene right before a frozen frame; and a video stopped on a
  frozen frame, then moved elsewhere on the timeline, could stay frozen when you pressed play. Both fixed.
- **Behind the scenes:** the Lab's beat timing check no longer fails at random on a busy test machine. Its "one beat
  late" failure was the check comparing against a slightly different list of beats than the Lab uses; the beats
  themselves were on time.
