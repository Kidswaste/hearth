# Access 2 (round 32): "Full" given in AI setup now sticks, and a refusal says why

You asked: "why are chats read only even though I give them full file access?"

## What was wrong
- **The AI setup row only changed the chat that was open.** ⋯ AI setup → *Files on this computer* looked like a setting
  of the AI, but it set the open chat's own access (`chat.access`). Every new chat started back at the default: **off**
  for Claude, **read only** for Astra with a project folder (or read & write for Claude with one). So after one chat at
  Full, the next chat was read only / off again.
- **Full only counts inside the chat's folders** (by default a folder Hearth made for that chat). A write anywhere else
  showed a card or, when nobody answered, was quietly denied; Astra's sandbox blocked it with no word to you. Both
  looked like "it's read only".
- Checked and fine: Claude at Full really gets its file tools + Bash through Hearth's permission check
  (`--permission-prompt-tool`); Astra (Codex) at Read & write / Full really gets `workspace-write` with the folders as
  its writable roots (no network, no approvals it can't show). An old Claude Code without the permission flag gets
  read & write but no commands (unchanged; its prompt line says so).

## What changed
1. **⋯ AI setup → Files on this computer is the AI's own setting** (`agent.fileAccess = { level, folders }`): Off ·
   Read · Read & write · Full, used by **every chat** with that AI, new ones included.
2. **A chat can still set its own**: right-click ⋯ → Access → a level ("only this chat"), `/access`, or dropping a folder
   on the chat. The first row, **As in AI setup (Full)**, brings it back to the AI's setting.
3. **Its folders are listed in AI setup** (name + path, ✕ to stop using one), with **＋ Add a folder…**.
4. **My home folder**: one click, after a plain warning, lets it work anywhere in your home folder (Claude: deletes still
   go to the Trash and risky things still ask; Astra: the warning says its sandbox can't ask).
5. A plain hint under the level: what it does in those folders, and that anywhere else it asks first (Astra: is blocked).
6. When the open chat has its own setting, AI setup says so: **Use this one there too**.
7. **One line in the chat when something didn't happen, and why**: "Claude couldn't write notes.txt: it's outside the
   folders it may use (`~/Desktop` isn't one of them)" · "…may only read files (Read)" · "…may not run commands
   (Read & write)" · "Astra's sandbox blocked a change in …", with the fix as a button: **Allow this folder** /
   **Allow edits** / **Allow commands**, plus **Open AI setup**.
8. Astra's refusals now reach that line and the activity log too: a failed edit outside its folders, a command its
   sandbox blocked (read-only file system / not permitted).
9. The badge after a chat's title shows the level also when it comes from AI setup (its tooltip says whose setting it is).
10. The Access panel (badge click, `/access panel`) says whose setting it is, with **Use AI setup's instead** / **Open AI setup**.
11. Plain words instead of commands: the AIs are told "the user can allow edits in ⋯ AI setup" (not "/access write");
    Astra's sandbox error points to AI setup (not /astra-files).
12. "Allow for this chat" no longer freezes a chat's level: it remembers the permission and the chat keeps following the AI.
13. Check this computer (first run) also checks the AIs' own folders.

Nothing to migrate: AIs without the new setting behave as before (a chat's own setting, the old project folder, or off).
Token cost: unchanged when access is off; a few words more on the read-only line.

## Tested
- `dev/checks/access-chat.js` (+ part 6–7): AI setup → Full → a **new** chat writes in the AI's folder without a card; a
  write outside asks, and unanswered gets the one-line note with Allow this folder / Open AI setup (which adds the folder);
  a chat's own Read can't write; "As in AI setup" brings Full back; **Astra with Full** writes in its folder, and its
  blocked write outside gets the note.
- `dev/checks/options.js`: the row saves Full on the AI with a folder; a new chat gets (and sends) Full.
- `node dev/access-test.js`: Codex Full writes and runs; a failed edit and a blocked command are reported.
- access-astra, astra-engine-test, connections, lazy, boot-test, firstrun-test.

## For the patch notes
1. Fixed: giving an AI **Full** file access in ⋯ AI setup now applies to **all its chats**, new ones too (before, it only changed the chat that was open, so the next chat was read only again).
2. ⋯ AI setup → **Files on this computer** shows the folders it may use, with **＋ Add a folder…** and ✕ to remove one.
3. **My home folder**: let an AI work anywhere in your home folder, after a clear warning.
4. A chat can still have its own setting (right-click ⋯ → Access); **As in AI setup** puts it back.
5. When an AI couldn't change a file, the chat now says why in one line (outside its folders, read only, no commands) with a one-click fix: **Allow this folder**, **Allow edits** or **Allow commands**, and **Open AI setup**.
6. Astra's sandbox refusals are now explained the same way and listed in the activity log.
7. Caveat: Full still means "inside its folders"; anywhere else Claude asks you first and Astra is blocked (its sandbox can't ask).
