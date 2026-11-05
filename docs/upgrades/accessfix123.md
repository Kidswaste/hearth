# access-chat passes again (round 123, accessfix123)

The app check `access-chat` (dev/checks/access-chat.js) passed on 0db24de and has failed since round 116
(projchats116). At eb32083 it timed out. From round 117 on, five steps failed:

- Allow this folder adds it to the AI's folders
- turning the sandbox off asks first, and says deletes can't go to the Trash
- …and then it is saved on Astra
- after the opt-in the command runs (no sandbox, in its folder)
- AI setup (Windows) shows "Run commands without its sandbox", on

## Root cause (one, for all five)

The failed run's `misses` named it:

    Allow this folder → covered by dialog.ui-modal pc-ask "Which project is this chat for"
    Run without its sandbox… → covered by dialog.ui-modal pc-ask "Which project is this chat for"

The check runs on fresh data with no project open. Since round 116, a new chat with no project open asks **Which project
is this chat for?** (projchats.js `onNewChat` → `ask`).

- **Round 116.** The question opened on the check's first `Native.newChat`. The check then waited behind the modal and
  timed out.
- **Round 117.** The question opens only when the owner's own press started the chat (`navigator.userActivation.isActive`).
  The check clicks with real CDP mouse events (journey-lib `click`). Section 6's `Native.newChat(claude.id)` comes a
  couple of seconds after the check's last real click (the Deny on the tray card in section 4). That is still inside
  Chromium's transient activation, so to projchats it looks like the owner's ＋ New chat, and the question opens.

The modal then sat over the chat:

1. **Allow this folder.** The real click landed on the dialog, not on the note's button, so `addAiFolder` never ran.
   The AI's folders stayed `<data>/projects/claude` + the AI folder. `mine` was correct (`from: 'ai'`); `access.js`
   ~line 490 was never reached.
2. **Run without its sandbox….** The click also landed on the dialog, so `setNoSandbox` never ran. The check's
   `document.querySelector('dialog.ui-modal button.primary')` then found the pc-ask dialog's **＋ New project…**,
   not the confirm. So there was no "can't go to the Trash" text and `astraNoSandbox` was never saved.
3. **The next two steps** followed from that. The command still ran in `workspace-write` and was blocked by policy.
   AI setup's switch showed off.

Ruled out:

- **datalock119.** Its access.js change only adds Hearth's own data folder to `locked` when a chat's folders contain
  it. That isn't the case here, and the "Allow this folder" path is untouched.
- **sendpath122.** Its engines.js spawning is not involved. The sandbox args (`codexOpen`) are unchanged, and the run
  simply never had `astraNoSandbox`.
- **The chat landing in a project.** It changes neither `mine`, the active chat, nor which note shows. With a project
  open, every one of those steps passes unchanged.

## Decision: the check was wrong, not the app

Both owner flows work. "Allow this folder" adds the folder to the AI's own folders when the chat follows its AI. The
Windows opt-in asks first, saves `astraNoSandbox`, and the next session runs with `danger-full-access` in its first
folder.

The question itself is round 116's intended behaviour: a chat started by the owner with no project open asks which
project it is for. The check encoded the pre-116 assumption that a chat can be started outside any project.

So only the check changed. At its start it loads the projects group, makes a project of its own ("Access check", in
the run's throwaway data folder) and opens it in the list (`ProjChats.setScope`). This matches smooth46 and makes.
Every new chat the check starts then lands in that project with no question. No app file changed.

## Tests

- `HEARTH_THREE_DIR=… flock /tmp/hearth-run.lock timeout 1800 node dev/run-checks.js --exact access-chat`: passed
  (three runs, ~1 min each; before the fix it failed with the 5 steps above and the two `misses`).
- `run-checks --exact unit:access-test unit:datalock119-test unit:projchats116-test unit:sendpath122-test`: 4/4 passed.
- `node dev/boot-test.js`: 2,822 checks passed, within budget.

## For the patch notes

Nothing changes for you. A test of file access was still starting chats outside any project, the way things worked
before chats lived in projects. It now works in a project like you do, and it confirms again that **Allow this folder**
and Astra's **Run without its sandbox…** on Windows work.

## For Codex

No Codex-owned files touched. The only change is `dev/checks/access-chat.js` (marked `// (round 123, accessfix123)`).
