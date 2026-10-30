# Round 88: more of the Lab follows you, steadier checks
*October 2026*

## 🔁 More of the Lab follows you between computers
- More of what you make in the Lab now follows you between the PC and the Mac: the trigger bars you set for each song,
  a song's loop, the scenes you pinned to the top, your favourite effects, the stage set list, and which sequence each
  scene opens with. Unpin or remove something on one computer and it goes on the other too.
- If you change the same song's trigger bars on both computers at once, you keep both: the other computer's version shows
  up in your trigger presets as "(other setup)". Two set lists made at the same time are joined into one.
- A song you load from your Music or Downloads folder stays where it is. Hearth never copies your music by itself. When
  the other computer won't have that song, a note offers "Keep a copy with this scene so it plays on your other computer"
  with its size. One click and the scene plays on both computers. Typing /song keep asks again at any time.
- Live coding sends much less to OneDrive or iCloud. Each run used to re-send the history of every scene (several MB); now
  only the scene you're working on goes (about 30 times less). Scene pictures are only sent again when they actually look
  different.
- The first time you open the Lab after the update, your earlier versions are moved into the new layout by themselves.
  Nothing is lost, and History shows them as before.
- Install this update on both computers.

## 🧰 Steadier checks, two real fixes
- **Behind the scenes**: the timing checks now tell a slow app from a busy computer. When the computer is too busy to
  judge, they say so instead of failing. One check was brought up to date with the test video it is given.
- **Fixed**: the "Welcome to this computer" note no longer pops up over the open sync panel, where a click meant for
  "Sync now" could open AI setup instead. Notes now wait until the panel closes.
- **Smoother**: a very long chat opened read-only (its AI missing or turned off) opens at its end without stutter. It
  no longer lays out the messages that end up off screen.

## 🧱 Groundwork: saving very long chats in pieces
- Nothing changes for you yet. This round laid the groundwork for making very long chats much cheaper to save and
  to sync.
- Today, every reply in a very long chat (thousands of messages, about 60 MB) rewrites the whole chat on your disk.
  Your cloud folder then sends all of it to your other computer again. Hearth measured this: about 120 MB written and
  60 MB uploaded per reply.
- The new way keeps such a chat in pieces. Old pieces never change; only the newest piece and a small index are
  saved. In tests that is under 1 MB per reply instead of 120 MB, and a save takes a few milliseconds instead of a
  few hundred.
- It isn't switched on yet. Both computers will need the update first, and it was tested hard first: crashes at any
  moment, pieces arriving late or out of order on the other computer, and both computers writing at once. In every
  test the chat comes back exactly, or Hearth waits. A chat is never shown shorter than it is.
