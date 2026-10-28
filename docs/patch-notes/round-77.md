# Round 77: nothing comes back after you remove it, sync in seconds, Lab pictures on the beat
*October 2026*

## ☁ Every part of Hearth hands over cleanly between computers
- When your other computer's changes arrive, Hearth now writes what you were doing first and then shows the new version,
  everywhere: the Lab's scenes, boards, notes, the project worktable, chat ↔ scene links, saved prompts, music sessions,
  follows, show nights, photos and quick ideas.
- Something you remove right after it arrived from your other computer now stays removed (before, it could come back).
- The board, the worktable and the Notes panel update on screen by themselves, without losing your place: your view,
  selection, caret and scroll stay, and if you're typing or dragging they wait until you're done.
- A scene deleted on your other computer now also leaves the Lab here.
- Feature usage no longer counts your other computer's clicks twice.
- The sound bank no longer undoes a ★ you set on your other computer, and followed venues from your other computer are
  no longer overwritten.
- Install this update on both computers.

## ⚡ Sync in seconds
- Changes now reach your other computer much faster: Hearth sends a chat message, a project note or a scene within
  about half a second after you save, and picks up what arrives within half a second after your cloud drive delivers it.
- While a reply is streaming, everything else you do still syncs right away (it could wait up to two minutes before).
- The reply itself is sent once it settles (and every minute or so during a long one), so sync doesn't work all the
  time while Claude writes.
- Turning sync on for the first time: what the other computer sends now arrives at once, without restarting Hearth.
- Hearth does half as many sync checks as before: its own copies no longer trigger another check.
- When nothing changes, sync does nothing at all, as before: no extra checks, no battery cost.
- How fast your cloud drive itself uploads and downloads is up to it (iCloud usually takes a few seconds).

## 🎵 Lab pictures follow the sound you hear
- **The visuals now line up with the music you hear, frame by frame.** Before, they ran a few hundredths of a second
  ahead of the sound, more with Bluetooth headphones, and stepped in small jumps at high refresh rates. Now each
  frame shows exactly the moment you're hearing, smooth at 240 Hz, from the first beat to the end of a long song.
- **Jumping around the song stays in sync:** when you click somewhere on the timeline or a loop starts over, the
  picture changes when the sound does, and pausing or scrubbing still shows the exact spot.
- **Your scenes keep their music when an AI works on them in the background.** If Claude or Astra edits a scene with
  a song while you look at another one, it now runs on that song, silently. Beat-following animations and anything
  that reacts to the music come out the same as if you were watching.
- **Switching headphones or your audio interface mid-song no longer kills the sound.** If the sound output changes,
  pauses or changes its sample rate (44.1 ↔ 48 kHz), the song keeps playing from the same spot, without playing
  twice.
- To see how far behind your speakers play, right-click the play button: "♪ Pictures in sync with the sound".

## 📏 A guard for the speed gains
- Behind the scenes: Hearth now has a performance guard. About ten minutes of measurements check the speed-ups of
  the last rounds together: a quick start with a big history, opening and switching projects, clicking through chats,
  the Lab answering the AI's edits, a still Lab scene resting, sync passes that don't stall the app, and a quiet idle.
  If a future change makes any of them noticeably slower, the guard fails and points at the code that got busier, so
  the slowdown is fixed before it reaches you.

