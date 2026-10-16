# chatkeep (round 52, urgent): the director's chat and its scene never vanish

The owner, working on Clink (a heavy three.js scene) with the Three Director docked in the Lab: "a chat disappears in
front of my eyes and closes the scene … it even rolled back a few changes … it deletes the chat entirely too", and
🛟 Recover… didn't find the chat.

## What was found (reproduced on throwaway data, `dev/checks/chatkeep.js`)
1. **After any crash or reload of the window, Hearth opened on the first chat of the rail, with the Lab closed.**
   Nothing put the screen back except Freshen and an update (they kept their own state). A crash of the window's page
   (safetynetmain reloads it) or Ctrl/⌘+Shift+R (reloads the whole window, no question: one key away from the Lab's
   Shift+R "unshuffle") therefore looked exactly like the report: the docked chat gone from view, the scene "closed".
2. **The scene came back as saved, not as it was.** safetynet kept the last second of Lab work in its journal but only
   put it in the time machine as a version, so slider moves and the director's last edit looked rolled back.
3. **A new director chat's scene that hadn't reached the disk yet was lost** (the journal's plan treated "not on
   disk" as "deleted"); the chat then reopened on another scene or "New chat" with a starter.
4. **The director's tool calls in flight when the page went were never answered**: the reply hung for a minute (up
   to 45 for a render), the card said "still writing" and nothing came.
5. **Why Recover found nothing:** chat files have no automatic copies; Recover only offers copies found elsewhere
   (Recently deleted, sync, cloud, backups) of chats *missing from your chats folder*. A chat that is still in the
   folder but not shown, or that never reached its file, has no such copy. Not found anywhere: a delete path. Every
   delete goes through Trash (`Native.remove` / makes' dismiss → `data/trash`), which Recover does list; the
   director cannot run `/delete`; memory48's clean-up and chatswitch's kept lists only touch memory, never files.
   Chats are hidden, not deleted, when their AI is removed or turned off (the list grouped chats by AI and skipped
   unknown ones), and a store save that gave up after ~25 tries dropped the chat's latest content.

## Fixes
- **The view comes back after any reload or crash**: freshen.js keeps the screen, each AI's open chat and the Lab
  scene (ids only, no layout read) at every change; a page that comes back after a crash, a reload on purpose, an
  update or an unexpected exit puts them back (`safetynet:last` says why).
- **One calm line**: "Hearth's window crashed (out of memory?) and reloaded — your chat and scene are back" (the
  safetynet card's title; "(out of memory)" when Chromium says oom). A reload on purpose: "The window reloaded
  (⌘⇧R pressed) — …". The red "Hearth crashed last time" toast no longer stacks on it (the crash stays in /report).
- **Lab work back on screen**: the journal's state is applied to the scene on screen (one version, ↶ in the history).
- **An unsaved scene comes back under its own id** (`scenes.create({ id })`), so its chat finds it.
- **gamebridge answers in-flight calls when the page crashes / reloads**: the reply goes on and lands.
- **`data/devreport-crashes.json`** (the data folder next to the app): each window crash with Chromium's reason,
  exit code, free / total memory, Hearth's five biggest processes, what the page showed and its last memory reading
  (Freshen's 5-minute readings); reloads on purpose with who asked. Written atomically, last 40 kept.
- **Chats never vanish from the list**: a chat whose AI was removed or turned off shows under an AI of the same kind
  (a director's under the director docked there) and goes on there when opened.
- **🛟 Recover… looks everywhere a chat can be**: chats in your folder that the list didn't show; a chat save the
  store gave up on (now kept in `data/.held/chats`); Claude Code's and Codex's own records of conversations no chat
  holds (`~/.claude/projects/<Hearth's workspace>/*.jsonl`, `~/.codex/sessions/…`, last 60 days, read only) rebuilt
  as a chat with its session, so it can go on.

## Tests
- `dev/checks/chatkeep.js` (smoke, fake engines, 5 reloads): a crash right after a new director chat's edit; a GPU
  reset and the GPU process gone; the preview's process killed; Ctrl+Shift+R; the director's AI turned off (listed,
  Recover lists it, back on); Freshen; an update's reload. After each: both chats in their files and the list, the Lab,
  the chat and its scene on screen, the line, the crash record. Nothing in Recently deleted.
- `dev/chatkeep-test.js` (unit, 27 checks): engine records → chats (Claude / Codex formats, known ones skipped),
  hidden chats and their home, Recover scan + bring back on a throwaway folder, the crash file, the last exit.

## Caveats
- Out of memory itself wasn't reproduced (a real renderer OOM would take GBs here); the line says "(out of memory?)"
  for an unexplained crash and the crash file now holds what's needed to tell.
- Up to ≈ 1 s of edits can still be lost by a crash (the journal's pause).
- Engine records cover chats Claude Code / Codex ran in Hearth's own workspace folder; a chat with an AI given another
  folder isn't searched there.

## For the patch notes
- If Hearth's window crashes or reloads, you land back where you were: the Lab, the director's chat and its scene,
  with one line saying what happened.
- The last second of Lab work comes back on the scene itself, not just in the time machine.
- A chat whose AI was turned off or removed stays in your list.
- 🛟 Recover… now also finds chats your list wasn't showing, and conversations only Claude Code or Codex still
  remember, and brings them back as chats you can continue.
