# Round 83: a calmer, lighter start
*October 2026*

## 🧘 A calm start
- Hearth no longer rebuilds its "what did we decide?" search from scratch after every start. On a big set of chats
  that used to keep one processor core fully busy for a minute or more, about a minute after you opened Hearth. It
  now remembers that search between starts, catches up only the chats that changed, and does so gently in the
  background.
- Right after Hearth opens, it now gives the computer to what you do first. The extras it prepares in the background
  (tools, menus, the Lab's warm-up) wait until the start is over and you've paused for a few seconds, then load one at
  a time. Anything you click still opens right away.
- The weekly "where your tokens went" tip no longer re-reads all of your recent chats two minutes after every start.
  It reads them on the side, and at most once a day.
- Automatic backups no longer include Hearth's rebuildable caches, so they are a bit smaller and faster.

## 🚀 Room at startup
- Hearth's first screen is lighter: about 80 KB less code is read before the window shows. Settings, the Usage
  window and Sync's conflicts and deleted files now load quietly a moment after Hearth opens, instead of before it.
- Nothing looks or works differently: every button, key and command opens them from the first moment, as before.
- Fixed: pressing Ctrl+Shift+U quickly twice could leave the Usage window in a half-closed state.
