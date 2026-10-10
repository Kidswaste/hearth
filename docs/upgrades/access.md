# Access (round 14): chats read, write, delete and run things, and ask you before anything risky

You asked: "give chats access to write, read, delete and use, and let it ask me if it needs permission for something
that's potentially dangerous." Each chat now has **one access setting** — Off · Read · Read & write · Full — and the
folders it may use. Safe things happen silently; risky ones show a **card in the chat** (Allow once · Allow for this
chat · Deny, with an optional note back to the AI); no answer in time means no. Deletes go to the **Trash**, edits keep a
copy for **Undo**, and every chat has an **activity log**. Hearth never handles passwords.

Where it is (no new row of buttons): the chat's **⋯ → Access**, `/access` in any chat, a small badge after the chat's
title while access is on (click it), and the **🔐 line** under a reply that touched files.

Counted honestly: one line per thing you can see or use.

## One control per chat
1. **⋯ → Access**: Off · Read · Read & write · Full in one submenu (each with a one-line hint), the current level shown next to it.
2. **`/access`**: what this chat may do now (level, folders, what you allowed), with a button per level.
3. **`/access off` · `read` · `write` · `full`** set it from the composer (it takes effect from your next message).
4. **Its own project folder by default**: the agent's project folder when it has one, else a folder for this chat in Hearth's data (`projects/<chat name>`).
5. **More folders**: `/access add` opens a folder picker, `/access add <path>` adds one directly.
6. **Drop a folder on a chat** and it becomes one of its folders (a toast offers "Allow edits" when it was read-only).
7. **The Access panel** (badge, or ⋯ → Access → Folders, permissions and log…): the four levels, the folders (Open, ✕), what's allowed without asking, recent activity. Drop folders on its list too.
8. **`/access remove <n>`**, **`/access folders`**, **`/access open`** (opens the first folder).
9. **The badge** after the chat title (📁 Read / Read & write, 🔓 Full) only while the chat has its own access on.
10. **Any file can be attached** to a chat with access on (it opens it itself), not only text and pictures.
11. **Files you attached** to one of your last messages may be read wherever they are, without a card.

## It asks before anything risky (Claude)
12. **A permission check behind Claude Code's `--permission-prompt-tool`** (a small MCP server, `mcp/access-mcp.js`, connected to the app): every request Claude Code would have to ask about comes to Hearth.
13. **Safe things pass silently**: reading and editing inside the chat's folders, reading / building / running commands there (ls, cat, git status / add / commit, npm run, node, python, ffmpeg…), writing files there.
14. **The approval card**, inside the reply: what (the exact command or file), where, why it's risky, the details folded, and **Allow once · Allow for this chat · Deny**.
15. **A note back to the AI**: type it next to Deny ("not yet, review first") and the AI reads it.
16. **No answer in 3 minutes denies**; a thin line under the card shows the time left (one compositor animation).
17. **A heads-up when you're elsewhere**: a toast with Open, and a system notification + flashing icon when Hearth isn't in front.
18. **What asks**: deletes, moves / renames, installs (npm / pip / brew / apt / gem / cargo / curl | sh…), the network (curl, wget, git pull / clone…), publishing and pushing (git push, npm publish, gh, vercel, netlify, firebase, docker push…), system changes (kill, launchctl, defaults write, chown…), controlling other apps (osascript), anything that writes or reads outside the folders, files that usually hold keys (.env, SSH keys, .pem…), and printing environment variables.
19. **Hidden commands are checked too**: `$(…)`, backticks, `bash -c "…"`, `python -c` / `node -e` code that deletes or uses the network, `| xargs rm`, `find -delete`.
20. **Allow for this chat** stops asking for the same kind of thing (e.g. deletes in this folder, installs, one outside folder); the panel lists them with **Ask again**, `/access forget` clears them all.
21. **Read** gives Read / Glob / Grep only; **Read & write** adds edits; **Full** adds commands (Bash) and apps.
22. **An older Claude Code that doesn't know the flag** still works: Hearth drops it, retries at once and remembers for that copy; the chat gets what a project folder always had (edits, no commands).
23. **Hearth closed or not answering = denied**, never allowed.

## Deletes go to the Trash
24. **A chat's `rm` is done by Hearth with the Trash** (recoverable): after you allow it, Hearth moves the files to the Trash / Recycle Bin and the command becomes a harmless note to the AI.
25. **Deletes that can't go to the Trash** (globs, `git reset --hard`, `git clean`, `find -delete`, mixed commands) get the careful red card ("not recoverable").
26. **Astra moves files into `.hearth-trash/`** instead of deleting; Hearth empties that into the Trash after its turn.
27. **Hearth's own deletes** for chats go to the Trash and into the log (`Access.trash`).

## Activity log and Undo
28. **An activity log per chat**: every read, edit, new file, delete, command, refusal, denial (with your note), timeout and level change.
29. **`/access log`** opens it (newest first, Undo / Show per line); `/access log text` prints the last 20 in the chat.
30. **A copy before every edit** a chat makes in its folders (up to 25 MB a file), kept in Hearth's data.
31. **Undo** on any edit in the log, or **`/access undo`** for the last one: the old version comes back (the current one is kept too); a file the chat created goes to the Trash.
32. **Show** reveals a file from the log in Finder / Explorer.
33. **The 🔐 line under a reply** ("5 file actions · 2 written · 1 to the Trash · 1 denied") opens the log.

## Passwords and secrets
34. **Commands that ask for a password are refused** (sudo, su, ssh, scp, sftp, keychain unlocks, git credential…): the AI is told to ask you to run it in a terminal, and the chat shows the command with **Copy command**.
35. **Secrets are masked** wherever access shows or logs something (API keys, tokens, Bearer headers, passwords in URLs or `password=`).

## Astra (Codex)
36. **Read** → Codex's read-only sandbox with its shell on (it looks with ls / cat / rg).
37. **Read & write / Full** → Codex's workspace-write sandbox limited to the chat's folders, no network, no approval prompts (`codex exec` can't show them, so the sandbox is the safety and risky things stay impossible rather than asked).
38. **Astra's commands and edits land in the same activity log.**

## For the other features (apps, Adobe, deploy)
39. **`Access.ask({ agentId, action, target, risk, detail })` → true / false**: the same card (in the reply when one is running, else in a small tray above the composer), the same "Allow for this chat", logged in the chat.
40. **`access_ask`** for tool servers: any of Hearth's MCP tools can ask through the hub the same way.

## Token frugality
41. **Nothing is added** to the prompt, flags or messages while a chat's access is Off (the default); with access on, one line (~65 tokens at Full) plus the check's short tool definition.

Tests: `sh dev/run-checks.sh access` (dev/access-test.js: the classifier, the flags per level, real runs of the fake
CLIs through the permission server; dev/checks/access-chat.js and access-astra.js in the real window).
Not verified here: a real Claude Code / Codex CLI (faithful fakes only) and the Trash on a real Mac / Windows desktop.
