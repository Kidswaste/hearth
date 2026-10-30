# Round 89: long chats in pieces, smoother Lab, a quick Desk
*October 2026*

## ✂️ Send very long chats in pieces (new setting, off to start)
- **New, off unless you turn it on:** Settings › This computer & sync › **"Send very long chats in pieces (both
  computers need this update)"**.
- Today, every reply in a very long chat (thousands of messages) makes your cloud folder send the whole chat to your
  other computer again. For a 20 MB chat that is 20 MB per reply.
- With this on (on **both** computers), only the newest part of the chat travels: about 0.3 MB per reply in our test,
  instead of 20 MB. The full chat file is still sent once the chat has been quiet for a few minutes, so nothing is ever
  missing from your cloud folder.
- Your chats on each computer are kept exactly as before. Only what goes through the cloud folder changed.
- It only switches itself on when your other computer has the update and the box ticked too. Until then it says so,
  and everything syncs as it always has. Untick it any time: everything goes back to the old way at once.
- If a piece is late or lost on the way, Hearth waits for it. A chat is never shown shorter than it is. If the same
  chat was changed on both computers at once, nothing is lost: the newer change wins, and the other version waits in
  Deleted files with a note in the sync panel.
- Old pieces are kept in your cloud folder for 30 days before they go, in case one is needed. With heavy use that can
  take a few GB of cloud space.

## 🎬 Fewer hitches in the Lab
- **Switching scenes in the Lab no longer freezes the picture.** The scene you're leaving keeps moving until the new
  one is completely ready, then fades into it. Before, the old picture stood still for up to a few seconds while the
  new scene got ready.
- **No more stutter when something appears mid-show.** Things a scene shows later (on a drop, on a kick) are prepared
  when the scene starts, so they no longer make the picture stick the first time they appear.
- **New layers and effects come in smoothly.** A layer or an effect you add waits until it is fully prepared before
  it shows, and the rest of the picture keeps moving meanwhile.
- **Big pictures arrive without a jolt.** A large image is sent to the graphics card between two frames, not in the
  middle of one.
- Measured on a test computer without a graphics card; numbers from your own PC are still to come.

## 🗂 Big project Desks open without a freeze
- **Switching to a big project is smoother.** Arriving on Clink's Desk (over a thousand things) used to freeze the window
  for 50–70 ms. That was most of the hitch left when you switched projects. It is now 6–30 ms. The Desk looks and
  behaves exactly as before: same rows, same order, same open shelves, and it comes back scrolled where you left it from
  its very first frame.
- **Export… no longer stutters** when you click it on a project with long chats. Getting the file ready now happens in
  small pieces instead of one 70 ms freeze. The file is the same, and passwords, API keys and sign-ins are still taken
  out exactly as strictly as before.
