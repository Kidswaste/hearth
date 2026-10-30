# Round 87: the Lab between your computers, lighter long chats, room at startup
*October 2026*

## 🔁 The Lab between your PC and Mac
- A 3D model, a big texture or a sound you add to a Lab scene now always reaches your other computer, even when OneDrive
  or iCloud keeps files "online only" to save space. Before, files over 8 MB could stay in the cloud and the scene on the
  other computer had no model.
- When a picture or a model you added on one computer arrives, the scene you have open on the other one uses it right
  away. You no longer need to switch scenes to see it.
- Delete a scene on one computer and it goes into the Lab's Deleted sketches on the other one too. You can bring it back
  from there on either computer.
- Your own trigger presets and saved colour palettes now follow you between the PC and the Mac. Delete one on one
  computer and it goes on the other. If you made two with the same name before, you keep both.
- Scene edits, slider changes, new scenes and renames arrive in about 6 seconds with iCloud. Most of that is iCloud
  itself; Hearth's part is under a second.
- If you edit the same scene on both computers, nothing is lost. Different lines are combined. If you change the same line
  on both, Hearth keeps one and puts the other aside in the sync panel, where you can compare them and choose.
- Install this update on both computers.

## 💬 Long chats do less after each reply
- **Very long chats no longer slow down with every reply.** Hearth used to re-read the whole chat in the background
  after each answer to work out its token numbers. That took about a second each time in a 6,000-message chat; now it
  takes about 10 ms.
- **"Made here", the @file list and older messages work right away in very long chats.** Before, they sometimes needed
  a second try while the chat loaded.
- **A chat waiting for its AI opens instantly, even when it's very long.** "Show earlier" now loads a page at a time
  instead of freezing Hearth for many seconds.
- **Resizing the window keeps a long chat's scrollbar honest.** Older messages that aren't loaded now take the right
  height for the new width.

## 🚀 More room at startup
- Hearth's first screen is lighter again: about 70 KB less code is read before the window shows.
- The update button, comp dispatch (parts sent to other chats) and the part that keeps saved memory tidy now load a
  moment after Hearth opens instead of before it.
- Nothing looks or works differently: /update, /dispatch, their Ctrl/⌘+K lines, the ⬆ button and saved memory work
  from the first moment, as before.
- This makes room for the next features to start fast too.
