# Round 121: smoother sending, a tidier chats list
*November 2026*

## ✉️ Sending without a hitch
- Sending a message or a reply finishing could freeze Hearth for up to about a tenth of a second while it saved your
  token stats (working out the date the slow way, and re-reading and rewriting a big stats file each time). That
  saving now happens in the background: no more pause from Hearth's own work at those moments. Every reply is still
  counted exactly once, and nothing is lost if Hearth closes.
- Your settings are read once per message instead of twice, and the cost estimate of a chat's tools is worked out
  while you read, not when you press Send.

## 📁 A tidier chats list
- The old "group chats by project" code, which can't be used any more now that each chat lives in one project, is
  removed (about 230 lines). `/project group` and `/project filter` now say in one line that chats live in one
  project each.
